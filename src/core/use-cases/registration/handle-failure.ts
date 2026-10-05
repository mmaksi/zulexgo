import { applyEvent, filingDueSince, type Application } from "@/src/core/domain/application/application"
import { decideOnFailure, isUnrecognised, type FailureDecision } from "@/src/core/domain/registration/error-algorithm"
import type { Failure } from "@/src/core/domain/registration/failure"
import { HOLD_CHECK_INTERVAL_MS } from "@/src/core/domain/payment/hold-policy"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailCustomer, mailRefund } from "@/src/core/use-cases/mail/mail-customer"
import { settlePayment } from "@/src/core/use-cases/payment/settle-payment"

/**
 * Runs the error algorithm and acts on it. `retry` is how this context retries
 * silently (resubmit later, or ask the service to resume); the customer hears
 * nothing until the algorithm gives up.
 *
 * Every email goes out before the status is saved, and money is settled before
 * either. A failure anywhere leaves the application where it was, backed off by
 * the poller, so a later tick reruns the steps: settlement recognises what it
 * already did and each email carries a key of its transition, so nothing is
 * done or sent twice.
 *
 * Called when the registration service fails or refuses a submission (`submitToKba`),
 * and when it reports a failed or rejected application (`advanceStatus`). The decision
 * itself is the pure error algorithm (business logic §2); this only carries it out.
 */
export async function handleFailure(
  deps: Dependencies,
  application: Application,
  failure: Failure,
  retry: (application: Application) => Promise<Application>,
): Promise<void> {
  const now = deps.clock.now()
  // The patience for a submission that cannot be confirmed runs from when the order last became ready to be filed:
  // paid, or verified for a service that verifies first, so days of waiting for the customer do not use it up
  // (a correction that files the order afresh starts it over); none recorded counts as just filed.
  const readyAt = filingDueSince(application.history) ?? now
  const attempt = { retryAttempts: application.retryAttempts, waitedMs: now.getTime() - readyAt.getTime() }
  await applyDecision(deps, application, failure, decideOnFailure(failure, attempt, deps.errorCatalogue), retry)
}

/**
 * For a caller that already knows what must happen, such as money that went back before
 * the application was filed.
 *
 * What each decision does to the order:
 * - `retrySilently`: the customer hears nothing, no money moves and the status stays; only
 *   the attempt count and the schedule change.
 * - `failCorrectable` (5b): email 5b, then the status. The money is left alone, so the
 *   customer can still correct or cancel.
 * - `failFinal` (5c, or a full refund when the failure was ours): the payment is settled,
 *   then email 5c with what comes back, then email 6 if anything does, then the status.
 *   An identity verification that failed ends the order with its own event: the status
 *   machine does not let a failure of the KBA end an order that is still being verified.
 */
export async function applyDecision(
  deps: Dependencies,
  application: Application,
  failure: Failure,
  decision: FailureDecision,
  retry: (application: Application) => Promise<Application>,
): Promise<void> {
  const now = deps.clock.now()
  // Leaves automatic handling: the failure is kept for the page and the email, and with no
  // nextPollAt the order is no longer due (a 5b gets a daily one back below).
  const stopped = { ...application, failure, polling: { attempts: application.polling.attempts } }

  if (decision.action === "retrySilently") {
    // `retry` is the caller's idea of retrying: resubmit later, or ask the service to resume.
    await deps.repository.update(await retry({ ...application, retryAttempts: application.retryAttempts + 1 }))
    return
  }

  if (decision.action === "failCorrectable") {
    if (isUnrecognised(failure, deps.errorCatalogue)) {
      console.warn(`[error-algorithm] ${application.reference}: unrecognised KBA error code ${failure.code}, treated as correctable; add it to the catalogue`)
    }
    // Waiting on the customer can outlast the card hold, so the money is looked at daily until it is safe (Q20).
    const watched = { ...stopped, polling: { attempts: stopped.polling.attempts, nextPollAt: new Date(now.getTime() + HOLD_CHECK_INTERVAL_MS) } }
    const failed = applyEvent(watched, "failedCorrectable", now)
    await mailCustomer(deps, failed, "correctionRequired")
    await deps.repository.update(failed)
    return
  }

  // "full": the failure was ours (chiefly a submission left unconfirmed for a day), so
  // everything goes back; otherwise the processing fee is kept.
  if (decision.refund === "full") {
    console.warn(`[error-algorithm] ${application.reference}: failed for good on our side and refunded in full; if the service was involved it may hold an application under this order's idempotency key, so check the Zulex portal`)
  }
  const outcome = decision.refund === "full" ? ({ type: "ourTechnicalError" } as const) : ({ type: "failedFinal" } as const)
  const settled = await settlePayment(deps, application, outcome)
  const failed = applyEvent(stopped, failure.kind === "identityFailed" ? "identityVerificationFailed" : "failedFinal", now)
  // Email 5c names what comes back and what is kept; email 6 follows only if something comes back.
  await mailCustomer(deps, failed, "rejected", { refund: settled.returned, retained: settled.retained })
  if (settled.returned.cents > 0) await mailRefund(deps, failed, settled.returned)
  await deps.repository.update(failed)
}
