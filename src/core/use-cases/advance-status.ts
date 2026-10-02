import { applyEvent, type Application } from "@/src/core/domain/application"
import type { DocumentRef } from "@/src/core/domain/document"
import type { Failure } from "@/src/core/domain/failure"
import { HOLD_CHECK_INTERVAL_MS, HOLD_RETRY_MS } from "@/src/core/domain/hold-policy"
import { nextPollAt } from "@/src/core/domain/poll-schedule"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import type { GatewayStatus } from "@/src/core/ports/registration-gateway"
import type { Dependencies } from "./dependencies"
import { handleFailure } from "./handle-failure"
import { mailCustomer } from "./mail-customer"
import { guardHold } from "./secure-hold"
import { settlePayment } from "./settle-payment"
import { afterFailure, submitToKba } from "./submit-to-kba"

/** One poller step for one due application: resubmit it, watch its money, or ask the service how it is doing. */
export async function advanceStatus(deps: Dependencies, application: Application): Promise<void> {
  if (application.status === "submitted_and_paid") return backOffOnFailure(deps, application, () => submitToKba(deps, application))
  if (application.status === "failed_correctable") return watchHold(deps, application)
  if (application.status !== "submitted_to_kba") return

  // A hand-processed order's card is held for days; the status check must not wait on the provider, so a failed look is only logged.
  if (application.ikfzStatus !== "online") {
    await guardHold(deps, application).catch((error) => logHoldCheckFailed(application, error))
  }

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

  await backOffOnFailure(deps, application, async () => {
    const failure = failureOf(status)
    if (failure) {
      await handleFailure(deps, application, failure, async (retrying) => {
        await deps.registration.retry(retrying.zulexApplicationId!)
        return scheduleNextPoll(deps, retrying)
      })
      return
    }

    await complete(deps, application, status.documents)
  })
}

/**
 * Storage, settlement, retry and mail failures leave the order at its old status; without a backoff it would stay
 * first in the queue. The write is version-checked: it is dropped when another tick already moved the order, and
 * when it lands first the other tick's last write fails instead, so that tick is simply redone on the next poll.
 */
async function backOffOnFailure(deps: Dependencies, application: Application, step: () => Promise<void>): Promise<void> {
  try {
    await step()
  } catch (error) {
    await deps.repository.update(afterFailure(deps, application, error instanceof GatewayUnavailable ? error.retryAfterMs : undefined)).catch(() => undefined)
    throw error
  }
}

/** A 5b waits for the customer, who may take longer than the hold lasts: take the money in time, then stop looking. */
async function watchHold(deps: Dependencies, application: Application): Promise<void> {
  const reschedule = (afterMs?: number) => ({
    ...application,
    polling: { attempts: application.polling.attempts, nextPollAt: afterMs === undefined ? undefined : new Date(deps.clock.now().getTime() + afterMs) },
  })

  let held: boolean
  try {
    held = (await guardHold(deps, application)).status === "held"
  } catch (error) {
    await deps.repository.update(reschedule(HOLD_RETRY_MS))
    throw error
  }
  await deps.repository.update(reschedule(held ? HOLD_CHECK_INTERVAL_MS : undefined))
}

function logHoldCheckFailed({ reference }: Application, error: unknown) {
  console.error(`[payments] ${reference}: hold not checked: ${error instanceof Error ? error.name : "unknown error"}`)
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
  // Email before the status, so a failed send leaves the application at its old status and a later poll redoes these idempotent steps.
  await mailCustomer(deps, completed, "completed")
  await deps.repository.update(completed)
}

/** `attempts` counts checks made, so it indexes the delay before the next one. */
function scheduleNextPoll(deps: Dependencies, application: Application, retryAfterMs?: number): Application {
  const attempts = application.polling.attempts + 1
  const nextPoll = nextPollAt({ ikfzStatus: application.ikfzStatus, attempts, now: deps.clock.now(), retryAfterMs })
  return { ...application, polling: { attempts, nextPollAt: nextPoll } }
}
