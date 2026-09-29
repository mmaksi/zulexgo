import { applyEvent, type Application } from "@/src/core/domain/application"
import { decideOnFailure, isUnrecognised, type Failure } from "@/src/core/domain/error-algorithm"
import type { Dependencies } from "./dependencies"
import { mailCustomer } from "./mail-customer"
import { settlePayment } from "./settle-payment"

/**
 * Runs the error algorithm and acts on it. `retry` is how this context retries
 * silently (resubmit later, or ask the service to resume); the customer hears
 * nothing until the algorithm gives up.
 */
export async function handleFailure(
  deps: Dependencies,
  application: Application,
  failure: Failure,
  retry: (application: Application) => Promise<Application>,
): Promise<void> {
  const decision = decideOnFailure(failure, application.retryAttempts, deps.errorCatalogue)
  const now = deps.clock.now()
  const stopped = { ...application, polling: { attempts: application.polling.attempts } }

  if (decision.action === "retrySilently") {
    await deps.repository.update(await retry({ ...application, retryAttempts: application.retryAttempts + 1 }))
    return
  }

  if (decision.action === "failCorrectable") {
    if (isUnrecognised(failure, deps.errorCatalogue)) {
      console.warn(`[error-algorithm] ${application.reference}: unrecognised KBA error code ${failure.code}, treated as correctable; add it to the catalogue`)
    }
    const failed = await deps.repository.update(applyEvent(stopped, "failedCorrectable", now))
    await mailCustomer(deps, failed, "correctionRequired")
    return
  }

  const outcome = decision.refund === "full" ? ({ type: "ourTechnicalError" } as const) : ({ type: "failedFinal" } as const)
  const settled = await settlePayment(deps, application, outcome)
  const failed = await deps.repository.update(applyEvent(stopped, "failedFinal", now))
  await mailCustomer(deps, failed, "rejected", { refund: settled.returned })
}
