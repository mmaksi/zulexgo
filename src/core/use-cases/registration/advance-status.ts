import { applyEvent, type Application } from "@/src/core/domain/application/application"
import { requiresIdentityVerification } from "@/src/core/domain/application/application-status"
import type { DocumentRef } from "@/src/core/domain/registration/document"
import type { Failure } from "@/src/core/domain/registration/failure"
import { HOLD_CHECK_INTERVAL_MS, HOLD_RETRY_MS } from "@/src/core/domain/payment/hold-policy"
import { nextPaymentCheckAt } from "@/src/core/domain/payment/payment-check-policy"
import { nextPollAt } from "@/src/core/domain/registration/poll-schedule"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { checkIdentityVerification } from "@/src/core/use-cases/identity/check-identity-verification"
import { startIdentityVerification } from "@/src/core/use-cases/identity/start-identity-verification"
import type { GatewayStatus } from "@/src/core/ports/registration/registration-gateway"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { handleFailure } from "./handle-failure"
import { mailCustomer } from "@/src/core/use-cases/mail/mail-customer"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"
import { guardHold, guardHoldQuietly } from "@/src/core/use-cases/payment/secure-hold"
import { settlePayment } from "@/src/core/use-cases/payment/settle-payment"
import { afterFailure, submitToKba } from "./submit-to-kba"

export async function advanceStatus(deps: Dependencies, application: Application): Promise<void> {
  if (application.status === "awaiting_payment") return checkPayment(deps, application)
  if (application.status === "submitted_and_paid") {
    const proceed = requiresIdentityVerification(application.request.service) ? startIdentityVerification : submitToKba
    return backOffOnFailure(deps, application, () => proceed(deps, application))
  }
  if (application.status === "awaiting_identity_verification") return backOffOnFailure(deps, application, () => checkIdentityVerification(deps, application))
  if (application.status === "identity_verified") return backOffOnFailure(deps, application, () => submitToKba(deps, application))
  if (application.status === "failed_correctable") return watchHold(deps, application)
  if (application.status !== "submitted_to_kba") return

  if (application.ikfzStatus !== "online") await guardHoldQuietly(deps, application)

  let status: GatewayStatus
  try {
    status = await deps.registration.getStatus(application.request.service, application.zulexApplicationId!)
  } catch (error) {
    // Back off on any failure: an id the service rejects would otherwise be asked about every tick.
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
      // A refused retry still counts as used, or the next look would ask again for ever.
      await handleFailure(deps, application, failure, async (retrying) => {
        try {
          await deps.registration.retry(retrying.zulexApplicationId!)
        } catch (error) {
          if (error instanceof GatewayUnavailable) throw error
          console.warn(`[advance-status] ${application.reference}: retry refused (${error instanceof Error ? error.name : "unknown error"}), counted as used`)
        }
        return scheduleNextPoll(deps, retrying)
      })
      return
    }

    await complete(deps, application, status.documents)
  })
}

// The webhook confirms a payment first; this finds one whose notification was lost. A stale write is dropped harmlessly.
async function checkPayment(deps: Dependencies, application: Application): Promise<void> {
  try {
    await confirmPayment(deps, application.reference)
  } finally {
    const nextPollAt = nextPaymentCheckAt(application.history[0].at, deps.clock.now())
    await deps.repository.update({ ...application, polling: { attempts: application.polling.attempts, nextPollAt } }).catch(() => undefined)
  }
}

// Without a backoff the order stays first in the queue; a stale backoff write is dropped harmlessly.
async function backOffOnFailure(deps: Dependencies, application: Application, step: () => Promise<void>): Promise<void> {
  try {
    await step()
  } catch (error) {
    await deps.repository.update(afterFailure(deps, application, error instanceof GatewayUnavailable ? error.retryAfterMs : undefined)).catch(() => undefined)
    throw error
  }
}

// Provisional: launch plan Q20. A 5b's hold is looked at daily until it is captured or released.
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

// Launch plan Q23: a rejection may come as an error or as a rejection document; a confirmation wins.
function failureOf(status: Exclude<GatewayStatus, { state: "inProgress" }>): Failure | undefined {
  if (status.state === "failed") return { kind: "kbaError", code: status.error.code }
  const kinds = status.documents.map((document) => document.kind)
  if (kinds.includes("rejection") && !kinds.includes("confirmation")) return { kind: "rejectionDocument" }
  return undefined
}

// Documents first, so email 5a never offers downloads not yet stored; then money, email, status.
async function complete(deps: Dependencies, application: Application, documents: readonly DocumentRef[]) {
  for (const document of documents) {
    await deps.documents.put(application.reference, document, await deps.registration.fetchDocument(document.id))
  }
  await settlePayment(deps, application, { type: "completed" })
  // No nextPollAt: a completed order is never asked about again.
  const completed: Application = {
    ...applyEvent(application, "kbaCompleted", deps.clock.now()),
    polling: { attempts: application.polling.attempts },
  }
  // Email before status: a failed send leaves the old status for a later poll to redo.
  await mailCustomer(deps, completed, "completed")
  await deps.repository.update(completed)
}

function scheduleNextPoll(deps: Dependencies, application: Application, retryAfterMs?: number): Application {
  const attempts = application.polling.attempts + 1
  const nextPoll = nextPollAt({ ikfzStatus: application.ikfzStatus, attempts, now: deps.clock.now(), retryAfterMs })
  return { ...application, polling: { attempts, nextPollAt: nextPoll } }
}
