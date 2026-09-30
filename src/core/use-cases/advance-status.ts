import { applyEvent, type Application } from "@/src/core/domain/application"
import type { DocumentRef } from "@/src/core/domain/document"
import type { Failure } from "@/src/core/domain/error-algorithm"
import { nextPollAt } from "@/src/core/domain/poll-schedule"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import type { GatewayStatus } from "@/src/core/ports/registration-gateway"
import type { Dependencies } from "./dependencies"
import { handleFailure } from "./handle-failure"
import { mailCustomer } from "./mail-customer"
import { settlePayment } from "./settle-payment"
import { submitToKba } from "./submit-to-kba"

/** One poller step for one due application: resubmit it, or ask the service how it is doing. */
export async function advanceStatus(deps: Dependencies, application: Application): Promise<void> {
  if (application.status === "submitted_and_paid") return submitToKba(deps, application)
  if (application.status !== "submitted_to_kba") return

  let status: GatewayStatus
  try {
    status = await deps.registration.getStatus(application.zulexApplicationId!)
  } catch (error) {
    // Back off on any failure, not just an outage: an id the service rejects would otherwise be asked about every tick.
    const unavailable = error instanceof GatewayUnavailable
    await deps.repository.update(scheduleNextPoll(deps, application, unavailable ? error.retryAfterMs : undefined))
    if (!unavailable) throw error
    return
  }

  if (status.state === "inProgress") {
    await deps.repository.update(scheduleNextPoll(deps, application))
    return
  }

  const failure = failureOf(status)
  if (failure) {
    await handleFailure(deps, application, failure, async (retrying) => {
      await deps.registration.retry(retrying.zulexApplicationId!)
      return scheduleNextPoll(deps, retrying)
    })
    return
  }

  await complete(deps, application, status.documents)
}

function failureOf(status: Exclude<GatewayStatus, { state: "inProgress" }>): Failure | undefined {
  if (status.state === "failed") return { kind: "kbaError", code: status.error.code }
  const kinds = status.documents.map((document) => document.kind)
  if (kinds.includes("rejection") && !kinds.includes("confirmation")) return { kind: "rejectionDocument" }
  return undefined
}

async function complete(deps: Dependencies, application: Application, documents: readonly DocumentRef[]) {
  for (const document of documents) {
    await deps.documents.put(application.reference, document, await deps.registration.fetchDocument(document.id))
  }
  await settlePayment(deps, application, { type: "completed" })
  const completed: Application = {
    ...applyEvent(application, "kbaCompleted", deps.clock.now()),
    polling: { attempts: application.polling.attempts },
  }
  // Email before the status, so a failed send leaves the application due and the next tick redoes these idempotent steps.
  await mailCustomer(deps, completed, "completed")
  await deps.repository.update(completed)
}

/** `attempts` counts checks made, so it indexes the delay before the next one. */
function scheduleNextPoll(deps: Dependencies, application: Application, retryAfterMs?: number): Application {
  const attempts = application.polling.attempts + 1
  const nextPoll = nextPollAt({ ikfzStatus: application.ikfzStatus, attempts, now: deps.clock.now(), retryAfterMs })
  return { ...application, polling: { attempts, nextPollAt: nextPoll } }
}
