import { applyEvent, type Application } from "@/src/core/domain/application"
import type { Failure } from "@/src/core/domain/failure"
import { nextPollAt } from "@/src/core/domain/poll-schedule"
import { settledDecision } from "@/src/core/domain/refund-policy"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import type { Dependencies } from "./dependencies"
import { applyDecision, handleFailure } from "./handle-failure"
import { mailCustomer } from "./mail-customer"
import { captureHold } from "./secure-hold"

/**
 * Files a paid application with the registration service, right after payment
 * (Q5). The idempotency key is the application's own, so the silent
 * resubmission after a technical failure can never file twice.
 *
 * Called by `confirmPayment` as soon as the payment is recorded, by the poller for an
 * order still at `submitted_and_paid` (a submission that died, a resubmission waiting
 * out an outage, a filed order whose follow-up failed), and by a correction that files
 * the order afresh. An order at any other status is left alone, so a repeat is harmless.
 *
 * In order: money that already went back means the order is never filed and its failure
 * is finished instead. Not yet filed: the service is asked, and a failure goes to the
 * error algorithm (`handleFailure`): resubmit later, 5b, or 5c with a full refund. Filed:
 * the service's id is stored, then `completeFiling` takes the money (online authority),
 * moves the order to status 4 and sends email 4. A later tick can repeat any of it.
 */
export async function submitToKba(deps: Dependencies, application: Application): Promise<void> {
  if (application.status !== "submitted_and_paid") return

  // The silent retry of a submission: nothing exists at the service to ask to retry, so the
  // poller files the order again once the backoff (or the service's Retry-After) has passed.
  const resubmitLater = (error?: unknown) => async (retrying: Application) => ({
    ...retrying,
    polling: { ...retrying.polling, nextPollAt: resubmitAt(deps, retrying, error) },
  })

  // Money that already went back (our own failure whose email is still owed, a refund, or a hold that lapsed) is never
  // filed for: the failure is finished instead, so a service that recovered in the meantime cannot undo the refund.
  const payment = await deps.payments.getPayment(application.payment.id)
  if (settledDecision({ type: "ourTechnicalError" }, { ...payment, total: application.payment.total })) {
    return applyDecision(deps, application, { kind: "unavailable" }, { action: "failFinal", refund: "full" }, resubmitLater())
  }

  let filed = application
  if (!application.zulexApplicationId) {
    let applicationId: string
    try {
      ;({ applicationId } = await deps.registration.submitDeregistration(application.request, application.idempotencyKey))
    } catch (error) {
      await handleFailure(deps, application, toFailure(error, application), resubmitLater(error))
      // A refusal or an outage is expected; anything else (a wrong API key, an answer we cannot read) is rescheduled like them but left loud.
      if (error instanceof GatewayUnavailable || error instanceof GatewayRejected) return
      throw error
    }
    // Stored before anything else can fail, so a failed email never makes the next tick file it again:
    // how Zulex answers a replayed submission is unspecified (launch plan Q23).
    filed = await deps.repository.update({ ...application, zulexApplicationId: applicationId })
  }

  // Whatever fails from here, the application is already filed: back off before the next tick instead of retrying every minute
  // (an outage of the provider or the mailer would otherwise keep every such order first in the queue), and let the error show.
  await completeFiling(deps, filed).catch(async (error) => {
    // A reschedule that fails too must not hide the error behind it: the order stays due anyway.
    await deps.repository.update(afterFailure(deps, filed)).catch(() => undefined)
    throw error
  })
}

/**
 * What follows the service accepting the application: capture where the authority is online,
 * status 4, email 4, then the registration id on the payment, last and after the status is
 * saved, since it only serves reconciliation. Safe to rerun from the top: a payment no
 * longer held is left alone and email 4 is keyed by its transition.
 */
async function completeFiling(deps: Dependencies, filed: Application): Promise<void> {
  // Launch plan Q7: an online authority answers within hours, so its order is paid for once Zulex has it; a hand-processed one stays held.
  if (filed.ikfzStatus === "online") await captureHold(deps, filed)

  const now = deps.clock.now()
  const submitted: Application = {
    ...applyEvent(filed, "submittedToKba", now),
    retryAttempts: 0,
    polling: { attempts: 0, nextPollAt: nextPollAt({ ikfzStatus: filed.ikfzStatus, attempts: 0, now }) },
  }
  // Email before the status: an email that fails leaves the application at status 1, still due and already filed,
  // so the next tick only sends it again. The other order would lose the email for good.
  await mailCustomer(deps, submitted, "submittedToKba")
  await recordRegistration(deps, await deps.repository.update(submitted), filed.zulexApplicationId!)
}

/**
 * `polling.attempts` counts failed tries at these steps, so it indexes the delay: a minute at first, then the online
 * poll table, whatever the authority's own pace: a mailer outage must not make a hand-processed order wait six hours.
 */
export const afterFailure = (deps: Dependencies, application: Application, retryAfterMs?: number): Application => ({
  ...application,
  polling: {
    attempts: application.polling.attempts + 1,
    nextPollAt: nextPollAt({ ikfzStatus: "online", attempts: application.polling.attempts, now: deps.clock.now(), retryAfterMs }),
  },
})

/** For reconciling payments with registration fees only, so a provider failure is logged, never allowed to stop the application. */
async function recordRegistration(deps: Dependencies, application: Application, registrationId: string) {
  try {
    await deps.payments.recordRegistration(application.payment.id, registrationId)
  } catch (error) {
    console.warn(`[payments] ${application.reference}: registration id not recorded on the payment: ${error instanceof Error ? error.name : "unknown error"}`)
  }
}

/**
 * Only a refusal on the first attempt is known not to have filed anything.
 * Whatever else went wrong, the service may hold the application, and so may
 * it after a retry: a 400 answering a replay says nothing about the attempt
 * before it (launch plan Q23), so it is treated as one more unconfirmed try.
 */
function toFailure(error: unknown, { retryAttempts }: Application): Failure {
  return error instanceof GatewayRejected && retryAttempts === 0 ? { kind: "rejected" } : { kind: "unavailable" }
}

/** `retryAttempts` counts resubmissions, so it indexes the delay before the next: a minute at first, then the online poll table. */
const resubmitAt = (deps: Dependencies, application: Application, error: unknown) =>
  nextPollAt({
    ikfzStatus: "online",
    // `handleFailure` already counted this resubmission, so the first one waits the first delay.
    attempts: application.retryAttempts - 1,
    now: deps.clock.now(),
    retryAfterMs: error instanceof GatewayUnavailable ? error.retryAfterMs : undefined,
  })
