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

  let applicationId: string
  try {
    ;({ applicationId } = await deps.registration.submitDeregistration(application.request, application.idempotencyKey))
  } catch (error) {
    const failure = toFailure(error)
    await handleFailure(deps, application, failure, async (retrying) => ({
      ...retrying,
      polling: { ...retrying.polling, nextPollAt: resubmitAt(deps, retrying, error) },
    }))
    return
  }

  const now = deps.clock.now()
  const submitted = await deps.repository.update({
    ...applyEvent(application, "submittedToKba", now),
    zulexApplicationId: applicationId,
    retryAttempts: 0,
    polling: { attempts: 0, nextPollAt: nextPollAt({ ikfzStatus: application.ikfzStatus, attempts: 0, now }) },
  })
  await mailCustomer(deps, submitted, "submittedToKba")
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
