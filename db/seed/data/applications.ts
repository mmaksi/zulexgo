import { applyEvent, type Application } from "@/src/core/domain/application/application"
import type { Failure } from "@/src/core/domain/registration/failure"
import { parseApplicationReference } from "@/src/core/domain/application/application-reference"
import type { ApplicationEvent, ApplicationStatus } from "@/src/core/domain/application/application-status"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { emailSchema } from "@/src/core/domain/customer/email"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"

const CREATED_AT = new Date("2026-01-05T09:00:00.000Z")
const HOUR = 60 * 60 * 1000

/**
 * How each seeded application reached its status, through the real status
 * machine, so every history is one the app could have produced. A `Record`,
 * so a new status fails to compile until it is seeded. Each status owns its
 * number, which fixes its reference: staging keeps seeded rows across deploys,
 * so numbering by position would move references when a status is inserted.
 * These are de-registrations, which never wait for an identity verification, so
 * statuses 2 and 3 have no journey here.
 */
type DeregistrationStatus = Exclude<ApplicationStatus, "awaiting_identity_verification" | "identity_verified">

export const JOURNEYS: Record<DeregistrationStatus, { number: number; events: ApplicationEvent[]; failure?: Failure }> = {
  awaiting_payment: { number: 1, events: [] },
  submitted_and_paid: { number: 2, events: ["paymentConfirmed"] },
  submitted_to_kba: { number: 3, events: ["paymentConfirmed", "submittedToKba"] },
  completed: { number: 4, events: ["paymentConfirmed", "submittedToKba", "kbaCompleted"] },
  failed_correctable: { number: 5, events: ["paymentConfirmed", "submittedToKba", "failedCorrectable"], failure: { kind: "rejectionDocument" } },
  failed_final: { number: 6, events: ["paymentConfirmed", "submittedToKba", "failedFinal"], failure: { kind: "kbaError", code: 202 } },
  cancelled: { number: 7, events: ["paymentConfirmed", "submittedToKba", "failedCorrectable", "cancelledByCustomer"] },
}

export interface SeededApplication {
  readonly application: Application
  /** Open it in dev at /status/<statusToken> */
  readonly statusToken: string
}

function seeded(status: ApplicationStatus, { number, events, failure }: (typeof JOURNEYS)[DeregistrationStatus]): SeededApplication {
  const digits = String(number).padStart(2, "0")
  const slug = status.replaceAll("_", "-")
  const created: Application = {
    reference: parseApplicationReference(`ZG-SEED${digits}`),
    version: 0,
    status: "awaiting_payment",
    history: [{ status: "awaiting_payment", at: CREATED_AT }],
    request: parseDeregistrationRequest({
      plateCount: number % 2 === 0 ? 1 : 2,
      licencePlate: { prefix: "AAA", letters: "SD", numbers: String(number) },
      vin: `SEEDVIN00000000${digits}`,
      codes: { rearPlate: "SD1", frontPlate: "SD2", certificate: `SEED0${digits}` },
    }),
    email: emailSchema.parse(`seed-${slug}@example.test`),
    ikfzStatus: status === "failed_final" ? "unavailable" : "online",
    idempotencyKey: `seed-idempotency-${slug}`,
    payment: { id: `seed-payment-${slug}`, total: SERVICE_PRICES.deregistration },
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
      failure,
      zulexApplicationId: atKba ? `seed-zulex-${slug}` : undefined,
      polling: status === "submitted_to_kba" ? { nextPollAt: CREATED_AT, attempts: 1 } : application.polling,
    },
    statusToken: `seed-status-link-${slug}`,
  }
}

export const seededApplications = (journeys: Partial<typeof JOURNEYS>): SeededApplication[] =>
  Object.entries(journeys).map(([status, journey]) => seeded(status as ApplicationStatus, journey))

export const SEEDED_APPLICATIONS: readonly SeededApplication[] = seededApplications(JOURNEYS)
