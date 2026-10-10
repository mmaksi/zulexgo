import { applyEvent, type Application } from "@/src/core/domain/application/application"
import { filedFrom } from "@/src/core/domain/application/application-status"
import type { Failure } from "@/src/core/domain/registration/failure"
import { nextPollAt } from "@/src/core/domain/registration/poll-schedule"
import { settledDecision } from "@/src/core/domain/payment/refund-policy"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { applyDecision, handleFailure } from "./handle-failure"
import { mailCustomer } from "@/src/core/use-cases/mail/mail-customer"
import { captureHold } from "@/src/core/use-cases/payment/secure-hold"

// Launch plan Q5: filed right after payment.
export async function submitToKba(deps: Dependencies, application: Application): Promise<void> {
  if (application.status !== filedFrom(application.request.service)) return

  const resubmitLater = (error?: unknown) => async (retrying: Application) => ({
    ...retrying,
    polling: { ...retrying.polling, nextPollAt: resubmitAt(deps, retrying, error) },
  })

  // Money already gone back is never filed for, so a service that recovered cannot undo the refund.
  const payment = await deps.payments.getPayment(application.payment.id)
  if (settledDecision({ type: "ourTechnicalError" }, { ...payment, total: application.payment.total })) {
    return applyDecision(deps, application, { kind: "unavailable" }, { action: "failFinal", refund: "full" }, resubmitLater())
  }

  let filed = application
  if (!application.zulexApplicationId) {
    let applicationId: string
    try {
      ;({ applicationId } = await deps.registration.submit(application.request, application.idempotencyKey))
    } catch (error) {
      await handleFailure(deps, application, toFailure(error, application), resubmitLater(error))
      if (error instanceof GatewayUnavailable || error instanceof GatewayRejected) return
      throw error
    }
    // Stored before anything else can fail: Zulex's answer to a replayed submission is open (launch plan Q23).
    filed = await deps.repository.update({ ...application, zulexApplicationId: applicationId })
  }

  // Already filed: back off, or an outage keeps every such order first in the queue each minute.
  await completeFiling(deps, filed).catch(async (error) => {
    // A failed reschedule must not hide the error: the order stays due anyway.
    await deps.repository.update(afterFailure(deps, filed)).catch(() => undefined)
    throw error
  })
}

async function completeFiling(deps: Dependencies, filed: Application): Promise<void> {
  // Launch plan Q7: an online authority's order is paid for once Zulex has it; a manual one stays held.
  if (filed.ikfzStatus === "online") await captureHold(deps, filed)

  const now = deps.clock.now()
  const submitted: Application = {
    ...applyEvent(filed, "submittedToKba", now),
    retryAttempts: 0,
    polling: { attempts: 0, nextPollAt: nextPollAt({ ikfzStatus: filed.ikfzStatus, attempts: 0, now }) },
  }
  // Email before status: a failed email leaves it due and filed, so the next tick only resends it.
  await mailCustomer(deps, submitted, "submittedToKba")
  await recordRegistration(deps, await deps.repository.update(submitted), filed.zulexApplicationId!)
}

// Online pace whatever the authority: a mailer outage must not make a manual order wait six hours.
export const afterFailure = (deps: Dependencies, application: Application, retryAfterMs?: number): Application => ({
  ...application,
  polling: {
    attempts: application.polling.attempts + 1,
    nextPollAt: nextPollAt({ ikfzStatus: "online", attempts: application.polling.attempts, now: deps.clock.now(), retryAfterMs }),
  },
})

async function recordRegistration(deps: Dependencies, application: Application, registrationId: string) {
  try {
    await deps.payments.recordRegistration(application.payment.id, registrationId)
  } catch (error) {
    console.warn(`[payments] ${application.reference}: registration id not recorded on the payment: ${error instanceof Error ? error.name : "unknown error"}`)
  }
}

// Only a first-attempt refusal surely filed nothing: a 400 to a replay says nothing (launch plan Q23).
function toFailure(error: unknown, { retryAttempts }: Application): Failure {
  return error instanceof GatewayRejected && retryAttempts === 0 ? { kind: "rejected" } : { kind: "unavailable" }
}

const resubmitAt = (deps: Dependencies, application: Application, error: unknown) =>
  nextPollAt({
    ikfzStatus: "online",
    // `handleFailure` already counted this resubmission, so the first one waits the first delay.
    attempts: application.retryAttempts - 1,
    now: deps.clock.now(),
    retryAfterMs: error instanceof GatewayUnavailable ? error.retryAfterMs : undefined,
  })
