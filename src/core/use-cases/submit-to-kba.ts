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
 */
export async function submitToKba(deps: Dependencies, application: Application): Promise<void> {
  if (application.status !== "submitted_and_paid") return

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
      await handleFailure(deps, application, toFailure(error), resubmitLater(error))
      // A refusal or an outage is expected; anything else (a wrong API key, an answer we cannot read) is rescheduled like them but left loud.
      if (error instanceof GatewayUnavailable || error instanceof GatewayRejected) return
      throw error
    }
    // Stored before anything else can fail, so a failed email never makes the next tick file it again:
    // how Zulex answers a replayed submission is unspecified (launch plan Q23).
    filed = await deps.repository.update({ ...application, zulexApplicationId: applicationId })
  }

  // Launch plan Q7: an online authority answers within hours, so its order is paid for once Zulex has it; a hand-processed one stays held.
  if (application.ikfzStatus === "online") await captureHold(deps, filed)

  const now = deps.clock.now()
  const submitted: Application = {
    ...applyEvent(filed, "submittedToKba", now),
    retryAttempts: 0,
    polling: { attempts: 0, nextPollAt: nextPollAt({ ikfzStatus: application.ikfzStatus, attempts: 0, now }) },
  }
  // Email before the status: an email that fails leaves the application at status 1, still due and already filed,
  // so the next tick only sends it again. The other order would lose the email for good.
  await mailCustomer(deps, submitted, "submittedToKba")
  await recordRegistration(deps, await deps.repository.update(submitted), filed.zulexApplicationId!)
}

/** For reconciling payments with registration fees only, so a provider failure is logged, never allowed to stop the application. */
async function recordRegistration(deps: Dependencies, application: Application, registrationId: string) {
  try {
    await deps.payments.recordRegistration(application.payment.id, registrationId)
  } catch (error) {
    console.warn(`[payments] ${application.reference}: registration id not recorded on the payment: ${error instanceof Error ? error.name : "unknown error"}`)
  }
}

/** Only a refusal is known not to have filed anything: whatever else went wrong, the service may hold the application. */
function toFailure(error: unknown): Failure {
  return error instanceof GatewayRejected ? { kind: "rejected" } : { kind: "unavailable" }
}

/** `retryAttempts` counts resubmissions, so it indexes the delay before the next: a minute at first, then the online poll table. */
const resubmitAt = (deps: Dependencies, application: Application, error: unknown) =>
  nextPollAt({
    ikfzStatus: "online",
    attempts: application.retryAttempts - 1,
    now: deps.clock.now(),
    retryAfterMs: error instanceof GatewayUnavailable ? error.retryAfterMs : undefined,
  })
