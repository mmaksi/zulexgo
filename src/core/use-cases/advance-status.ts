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

/**
 * One poller step for one due application: resubmit it, watch its money, or ask
 * the service how it is doing. Called by `pollDueApplications` for every order whose
 * `nextPollAt` has passed; what the step is depends on where the order stands:
 *
 * - `submitted_and_paid`: not filed yet, or filed but its follow-up failed (an outage
 *   being waited out, a failed email 4), so `submitToKba` runs again.
 * - `failed_correctable` (5b): waiting for the customer; only the money is looked at.
 * - `submitted_to_kba`: ask the registration service how the KBA is doing. Still working:
 *   back off. Finished with a confirmation: 5a. Failed, or finished with only a rejection
 *   document: the error algorithm decides (`handleFailure`).
 * - Any other status is not polled, and nothing happens.
 *
 * Every step is safe to repeat. One that fails part-way leaves the order at its old status
 * and backs it off (`backOffOnFailure`), so a later tick redoes it without hammering the
 * service, the provider or the mailer.
 */
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

  // Also how a state tag the vendor adds later arrives (see the gateway port), so a new
  // one only keeps the order waiting instead of breaking the poll.
  if (status.state === "inProgress") {
    await deps.repository.update(scheduleNextPoll(deps, application))
    return
  }

  await backOffOnFailure(deps, application, async () => {
    const failure = failureOf(status)
    if (failure) {
      // If the algorithm retries silently, that means asking the service to resume this
      // application (no data change), then looking again on the usual schedule.
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

/**
 * A 5b waits for the customer, who may take longer than the hold lasts: take the
 * money in time, then stop looking.
 *
 * The order is visited daily (launch plan Q20, a provisional answer) while its payment
 * is still a hold: `guardHold` captures it once it is close to lapsing, and a payment
 * that is captured or released has nothing left to watch. The KBA is not asked again.
 */
async function watchHold(deps: Dependencies, application: Application): Promise<void> {
  // The attempt count is kept. With no delay there is no next poll, so the order is no longer due.
  const reschedule = (afterMs?: number) => ({
    ...application,
    polling: { attempts: application.polling.attempts, nextPollAt: afterMs === undefined ? undefined : new Date(deps.clock.now().getTime() + afterMs) },
  })

  let held: boolean
  try {
    held = (await guardHold(deps, application)).status === "held"
  } catch (error) {
    // The provider could not be asked: look again within the hour, not tomorrow, and let the
    // poll log show the failure.
    await deps.repository.update(reschedule(HOLD_RETRY_MS))
    throw error
  }
  await deps.repository.update(reschedule(held ? HOLD_CHECK_INTERVAL_MS : undefined))
}

/** By order and kind of error only: the message could hold personal data. */
function logHoldCheckFailed({ reference }: Application, error: unknown) {
  console.error(`[payments] ${reference}: hold not checked: ${error instanceof Error ? error.name : "unknown error"}`)
}

/**
 * Whether the service's answer is a failure for the error algorithm. The API does not
 * say whether a rejection comes as an error or as a finished application with a rejection
 * document (launch plan Q23), so both are read. A confirmation wins over a rejection
 * document sent alongside it; a finished application with no documents at all is a success.
 */
function failureOf(status: Exclude<GatewayStatus, { state: "inProgress" }>): Failure | undefined {
  if (status.state === "failed") return { kind: "kbaError", code: status.error.code }
  const kinds = status.documents.map((document) => document.kind)
  if (kinds.includes("rejection") && !kinds.includes("confirmation")) return { kind: "rejectionDocument" }
  return undefined
}

/**
 * The KBA finished with a result we accept (5a). Every step is safe to rerun, so a failure
 * anywhere leaves the order at `submitted_to_kba`, backed off by `backOffOnFailure`: the documents are stored first, so that email 5a never
 * reaches the customer before the downloads it offers; then the money is settled (a card
 * still held is captured in full), then the email, then the status.
 */
async function complete(deps: Dependencies, application: Application, documents: readonly DocumentRef[]) {
  // Our copy of what the service holds, so the page serves it without calling the service.
  // Storing a document again replaces it, so a rerun duplicates nothing.
  for (const document of documents) {
    await deps.documents.put(application.reference, document, await deps.registration.fetchDocument(document.id))
  }
  await settlePayment(deps, application, { type: "completed" })
  // No nextPollAt: a completed order is never asked about again.
  const completed: Application = {
    ...applyEvent(application, "kbaCompleted", deps.clock.now()),
    polling: { attempts: application.polling.attempts },
  }
  // Email before the status, so a failed send leaves the application at its old status and a later poll redoes these idempotent steps.
  await mailCustomer(deps, completed, "completed")
  await deps.repository.update(completed)
}

/**
 * `attempts` counts checks made, so it indexes the delay before the next one.
 * `retryAfterMs` is the service's own Retry-After: the delay is never shorter than it.
 */
function scheduleNextPoll(deps: Dependencies, application: Application, retryAfterMs?: number): Application {
  const attempts = application.polling.attempts + 1
  const nextPoll = nextPollAt({ ikfzStatus: application.ikfzStatus, attempts, now: deps.clock.now(), retryAfterMs })
  return { ...application, polling: { attempts, nextPollAt: nextPoll } }
}
