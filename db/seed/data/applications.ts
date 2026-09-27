import { applyEvent, type Application } from "@/src/core/domain/application"
import { parseApplicationReference } from "@/src/core/domain/application-reference"
import type { ApplicationEvent, ApplicationStatus } from "@/src/core/domain/application-status"
import { parseDeregistrationRequest } from "@/src/core/domain/deregistration-request"
import { emailSchema } from "@/src/core/domain/email"
import { DEREGISTRATION_TOTAL } from "@/src/core/domain/pricing"

const CREATED_AT = new Date("2026-01-05T09:00:00.000Z")
const HOUR = 60 * 60 * 1000

/**
 * How each seeded application reached its status, through the real status
 * machine, so every history is one the app could have produced. A `Record`,
 * so a new status fails to compile until it is seeded.
 */
const JOURNEYS: Record<ApplicationStatus, ApplicationEvent[]> = {
  awaiting_payment: [],
  submitted_and_paid: ["paymentConfirmed"],
  submitted_to_kba: ["paymentConfirmed", "submittedToKba"],
  completed: ["paymentConfirmed", "submittedToKba", "kbaCompleted"],
  failed_correctable: ["paymentConfirmed", "submittedToKba", "failedCorrectable"],
  failed_final: ["paymentConfirmed", "submittedToKba", "failedFinal"],
  cancelled: ["paymentConfirmed", "submittedToKba", "failedCorrectable", "cancelledByCustomer"],
}

export interface SeededApplication {
  readonly application: Application
  /** Open it in dev at /status/<statusToken>. Obviously fake, never a real token's shape. */
  readonly statusToken: string
}

function seeded(status: ApplicationStatus, events: ApplicationEvent[], index: number): SeededApplication {
  const number = index + 1
  const slug = status.replaceAll("_", "-")
  const created: Application = {
    reference: parseApplicationReference(`ZG-SEED0${number}`),
    version: 0,
    status: "awaiting_payment",
    history: [{ status: "awaiting_payment", at: CREATED_AT }],
    request: parseDeregistrationRequest({
      plateCount: number % 2 === 0 ? 1 : 2,
      licencePlate: { prefix: "AAA", letters: "SD", numbers: String(number) },
      vin: `SEEDVIN000000000${number}`,
      codes: { rearPlate: "SD1", frontPlate: "SD2", certificate: `SEED00${number}` },
    }),
    email: emailSchema.parse(`seed-${slug}@example.test`),
    ikfzStatus: status === "failed_final" ? "unavailable" : "online",
    idempotencyKey: `seed-idempotency-${slug}`,
    payment: { id: `seed-payment-${slug}`, total: DEREGISTRATION_TOTAL },
    retryAttempts: 0,
    polling: { attempts: 0 },
  }

  const application = events.reduce(
    (current, event, step) => applyEvent(current, event, new Date(CREATED_AT.getTime() + (step + 1) * HOUR)),
    created,
  )
  const atKba = events.includes("submittedToKba")

  return {
    application: {
      ...application,
      zulexApplicationId: atKba ? `seed-zulex-${slug}` : undefined,
      polling: status === "submitted_to_kba" ? { nextPollAt: CREATED_AT, attempts: 1 } : application.polling,
    },
    statusToken: `seed-status-link-${slug}`,
  }
}

export const SEEDED_APPLICATIONS: readonly SeededApplication[] = Object.entries(JOURNEYS).map(([status, events], index) =>
  seeded(status as ApplicationStatus, events, index),
)
