import { applyEvent, filingDueSince, type Application } from "@/src/core/domain/application/application"
import { decideOnFailure, isUnrecognised, type FailureDecision } from "@/src/core/domain/registration/error-algorithm"
import type { Failure } from "@/src/core/domain/registration/failure"
import { HOLD_CHECK_INTERVAL_MS } from "@/src/core/domain/payment/hold-policy"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailCustomer, mailRefund } from "@/src/core/use-cases/mail/mail-customer"
import { settlePayment } from "@/src/core/use-cases/payment/settle-payment"

export async function handleFailure(
  deps: Dependencies,
  application: Application,
  failure: Failure,
  retry: (application: Application) => Promise<Application>,
): Promise<void> {
  const now = deps.clock.now()
  const readyAt = filingDueSince(application.history) ?? now
  const attempt = { retryAttempts: application.retryAttempts, waitedMs: now.getTime() - readyAt.getTime() }
  await applyDecision(deps, application, failure, decideOnFailure(failure, attempt, deps.errorCatalogue), retry)
}

// Money, then email, then status: a failed step leaves the order as it was for a later tick to rerun.
export async function applyDecision(
  deps: Dependencies,
  application: Application,
  failure: Failure,
  decision: FailureDecision,
  retry: (application: Application) => Promise<Application>,
): Promise<void> {
  const now = deps.clock.now()
  // Without nextPollAt the order is no longer due; a 5b gets a daily one back below.
  const stopped = { ...application, failure, polling: { attempts: application.polling.attempts } }

  if (decision.action === "retrySilently") {
    await deps.repository.update(await retry({ ...application, retryAttempts: application.retryAttempts + 1 }))
    return
  }

  if (decision.action === "failCorrectable") {
    if (isUnrecognised(failure, deps.errorCatalogue)) {
      console.warn(`[error-algorithm] ${application.reference}: unrecognised KBA error code ${failure.code}, treated as correctable; add it to the catalogue`)
    }
    // Waiting on the customer can outlast the card hold, so the money is looked at daily (launch plan Q20).
    const watched = { ...stopped, polling: { attempts: stopped.polling.attempts, nextPollAt: new Date(now.getTime() + HOLD_CHECK_INTERVAL_MS) } }
    const failed = applyEvent(watched, "failedCorrectable", now)
    await mailCustomer(deps, failed, "correctionRequired")
    await deps.repository.update(failed)
    return
  }

  if (decision.refund === "full") {
    console.warn(`[error-algorithm] ${application.reference}: failed for good on our side and refunded in full; if the service was involved it may hold an application under this order's idempotency key, so check the Zulex portal`)
  }
  const outcome = decision.refund === "full" ? ({ type: "ourTechnicalError" } as const) : ({ type: "failedFinal" } as const)
  const settled = await settlePayment(deps, application, outcome)
  const failed = applyEvent(stopped, failure.kind === "identityFailed" ? "identityVerificationFailed" : "failedFinal", now)
  await mailCustomer(deps, failed, "rejected", { refund: settled.returned, retained: settled.retained })
  if (settled.returned.cents > 0) await mailRefund(deps, failed, settled.returned)
  await deps.repository.update(failed)
}
