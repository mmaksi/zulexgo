import { applyEvent, type Application } from "@/src/core/domain/application"
import { decideOnFailure, isUnrecognised } from "@/src/core/domain/error-algorithm"
import type { Failure } from "@/src/core/domain/failure"
import { HOLD_CHECK_INTERVAL_MS } from "@/src/core/domain/hold-policy"
import type { Dependencies } from "./dependencies"
import { mailCustomer, mailRefund } from "./mail-customer"
import { settlePayment } from "./settle-payment"

/**
 * Runs the error algorithm and acts on it. `retry` is how this context retries
 * silently (resubmit later, or ask the service to resume); the customer hears
 * nothing until the algorithm gives up.
 *
 * Every email goes out before the status is saved, and money is settled before
 * either. A failure anywhere leaves the application where it was, still due, so
 * the next tick reruns the steps: settlement recognises what it already did and
 * each email carries a key of its transition, so nothing is done or sent twice.
 */
export async function handleFailure(
  deps: Dependencies,
  application: Application,
  failure: Failure,
  retry: (application: Application) => Promise<Application>,
): Promise<void> {
  const decision = decideOnFailure(failure, application.retryAttempts, deps.errorCatalogue)
  const now = deps.clock.now()
  const stopped = { ...application, failure, polling: { attempts: application.polling.attempts } }

  if (decision.action === "retrySilently") {
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

  const outcome = decision.refund === "full" ? ({ type: "ourTechnicalError" } as const) : ({ type: "failedFinal" } as const)
  const settled = await settlePayment(deps, application, outcome)
  const failed = applyEvent(stopped, "failedFinal", now)
  await mailCustomer(deps, failed, "rejected", { refund: settled.returned, retained: settled.retained })
  if (settled.returned.cents > 0) await mailRefund(deps, failed, settled.returned)
  await deps.repository.update(failed)
}
