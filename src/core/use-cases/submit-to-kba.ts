import { applyEvent, type Application } from "@/src/core/domain/application"
import type { Failure } from "@/src/core/domain/error-algorithm"
import { nextPollAt } from "@/src/core/domain/poll-schedule"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import type { Dependencies } from "./dependencies"
import { handleFailure } from "./handle-failure"
import { mailCustomer } from "./mail-customer"

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

  // Money that already went back (our own failure whose email is still owed, or a hold that lapsed) is never filed for:
  // the failure is finished instead, so a service that recovered in the meantime cannot undo the refund.
  if ((await deps.payments.getPayment(application.payment.id)).status === "released") {
    return handleFailure(deps, application, { kind: "unavailable" }, resubmitLater())
  }

  let applicationId: string
  try {
    ;({ applicationId } = await deps.registration.submitDeregistration(application.request, application.idempotencyKey))
  } catch (error) {
    await handleFailure(deps, application, toFailure(error), resubmitLater(error))
    return
  }

  const now = deps.clock.now()
  const submitted: Application = {
    ...applyEvent(application, "submittedToKba", now),
    zulexApplicationId: applicationId,
    retryAttempts: 0,
    polling: { attempts: 0, nextPollAt: nextPollAt({ ikfzStatus: application.ikfzStatus, attempts: 0, now }) },
  }
  // Email before the status: an email that fails leaves the application at status 1, still due, so the next tick
  // resubmits (same idempotency key) and tries again. The other order would lose the email for good.
  await mailCustomer(deps, submitted, "submittedToKba")
  await recordRegistration(deps, await deps.repository.update(submitted), applicationId)
}

/** For reconciling payments with registration fees only, so a provider failure is logged, never allowed to stop the application. */
async function recordRegistration(deps: Dependencies, application: Application, registrationId: string) {
  try {
    await deps.payments.recordRegistration(application.payment.id, registrationId)
  } catch (error) {
    console.warn(`[payments] ${application.reference}: registration id not recorded on the payment: ${error instanceof Error ? error.name : "unknown error"}`)
  }
}

function toFailure(error: unknown): Failure {
  if (error instanceof GatewayUnavailable) return { kind: "unavailable" }
  if (error instanceof GatewayRejected) return { kind: "rejected" }
  throw error
}

const resubmitAt = (deps: Dependencies, application: Application, error: unknown) =>
  nextPollAt({
    ikfzStatus: "online",
    attempts: 0,
    now: deps.clock.now(),
    retryAfterMs: error instanceof GatewayUnavailable ? error.retryAfterMs : undefined,
  })
