import { applyEvent, type Application } from "@/src/core/domain/application/application"
import type { Failure } from "@/src/core/domain/registration/failure"
import { parseApplicationReference } from "@/src/core/domain/application/application-reference"
import type { ApplicationEvent, ApplicationStatus } from "@/src/core/domain/application/application-status"
import { recordConsent } from "@/src/core/domain/application/consent"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import type { OrderableService, ServiceRequest } from "@/src/core/domain/application/service"
import { emailSchema } from "@/src/core/domain/customer/email"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { verificationDeadlineAt } from "@/src/core/domain/payment/verification-policy"

const CREATED_AT = new Date("2026-01-05T09:00:00.000Z")
const HOUR = 60 * 60 * 1000

type DeregistrationStatus = Exclude<ApplicationStatus, "awaiting_identity_verification" | "identity_verified">

interface Journey {
  readonly number: number
  readonly events: ApplicationEvent[]
  readonly failure?: Failure
}

// Fixed numbers, not positions: staging keeps seeded rows, so renumbering would move their references.
export const JOURNEYS = {
  deregistration: {
    awaiting_payment: { number: 1, events: [] },
    submitted_and_paid: { number: 2, events: ["paymentConfirmed"] },
    submitted_to_kba: { number: 3, events: ["paymentConfirmed", "submittedToKba"] },
    completed: { number: 4, events: ["paymentConfirmed", "submittedToKba", "kbaCompleted"] },
    failed_correctable: { number: 5, events: ["paymentConfirmed", "submittedToKba", "failedCorrectable"], failure: { kind: "rejectionDocument" } },
    failed_final: { number: 6, events: ["paymentConfirmed", "submittedToKba", "failedFinal"], failure: { kind: "kbaError", code: 202 } },
    cancelled: { number: 7, events: ["paymentConfirmed", "submittedToKba", "failedCorrectable", "cancelledByCustomer"] },
  } satisfies Record<DeregistrationStatus, Journey>,
  newRegistration: {
    awaiting_payment: { number: 11, events: [] },
    submitted_and_paid: { number: 12, events: ["paymentConfirmed"] },
    awaiting_identity_verification: { number: 13, events: ["paymentConfirmed", "identityVerificationStarted"] },
    identity_verified: { number: 14, events: ["paymentConfirmed", "identityVerificationStarted", "identityVerified"] },
    submitted_to_kba: { number: 15, events: ["paymentConfirmed", "identityVerificationStarted", "identityVerified", "submittedToKba"] },
    completed: { number: 16, events: ["paymentConfirmed", "identityVerificationStarted", "identityVerified", "submittedToKba", "kbaCompleted"] },
    failed_correctable: {
      number: 17,
      events: ["paymentConfirmed", "identityVerificationStarted", "identityVerified", "submittedToKba", "failedCorrectable"],
      failure: { kind: "rejected" },
    },
    failed_final: {
      number: 18,
      events: ["paymentConfirmed", "identityVerificationStarted", "identityVerified", "submittedToKba", "failedFinal"],
      failure: { kind: "rejected" },
    },
    cancelled: {
      number: 19,
      events: ["paymentConfirmed", "identityVerificationStarted", "identityVerified", "submittedToKba", "failedCorrectable", "cancelledByCustomer"],
    },
  } satisfies Record<ApplicationStatus, Journey>,
} satisfies Record<OrderableService, Partial<Record<ApplicationStatus, Journey>>>

export interface SeededApplication {
  readonly application: Application
  readonly statusToken: string
}

function newRegistrationRequestOf(digits: string): ServiceRequest {
  return parseNewRegistrationRequest(
    {
      vin: `SEEDNEW00000000${digits}`,
      engineType: "combustion",
      evbNumber: "SEEDEVB",
      registrationCertificate: { number: `SEED00${digits}`, securityCode: "SEEDCODE" },
      owner: {
        firstName: "Erika",
        lastName: "Mustermann",
        gender: "female",
        birthDate: "1990-05-17",
        birthPlace: "Musterstadt",
        phone: "+49 30 23125000",
        email: `seed-owner-${digits}@example.test`,
        address: { street: "Beispielstraße", houseNumber: "12a", postcode: "10115", city: "Berlin" },
      },
      bankAccount: { iban: "DE89370400440532013000", bic: "COBADEFFXXX", bankName: "Beispielbank" },
      plate: { electric: false },
    },
    CREATED_AT,
  )
}

function deregistrationRequestOf(number: number, digits: string): ServiceRequest {
  return parseDeregistrationRequest({
    plateCount: number % 2 === 0 ? 1 : 2,
    licencePlate: { prefix: "AAA", letters: "SD", numbers: String(number) },
    vin: `SEEDVIN00000000${digits}`,
    codes: { rearPlate: "SD1", frontPlate: "SD2", certificate: `SEED0${digits}` },
  })
}

const SLUG_PREFIX: Record<OrderableService, string> = { deregistration: "", newRegistration: "new-registration-" }

function seeded(service: OrderableService, status: ApplicationStatus, { number, events, failure }: Journey): SeededApplication {
  const digits = String(number).padStart(2, "0")
  const slug = `${SLUG_PREFIX[service]}${status.replaceAll("_", "-")}`
  const created: Application = {
    reference: parseApplicationReference(`ZG-SEED${digits}`),
    version: 0,
    status: "awaiting_payment",
    history: [{ status: "awaiting_payment", at: CREATED_AT }],
    request: service === "deregistration" ? deregistrationRequestOf(number, digits) : newRegistrationRequestOf(digits),
    email: emailSchema.parse(`seed-${slug}@example.test`),
    consent: recordConsent(service, { terms: true, earlyStart: true, powerOfAttorney: true }, CREATED_AT),
    ikfzStatus: status === "failed_final" ? "unavailable" : "online",
    idempotencyKey: `seed-idempotency-${slug}`,
    payment: { id: `seed-payment-${slug}`, total: SERVICE_PRICES[service] },
    retryAttempts: 0,
    polling: { attempts: 0 },
  }

  const application = events.reduce(
    (current, event, step) => applyEvent(current, event, new Date(CREATED_AT.getTime() + (step + 1) * HOUR)),
    created,
  )
  const atKba = events.includes("submittedToKba")
  const verificationStartedAt = application.history.find((change) => change.status === "awaiting_identity_verification")?.at

  return {
    application: {
      ...application,
      failure,
      zulexApplicationId: atKba ? `seed-zulex-${slug}` : undefined,
      identityVerification: verificationStartedAt && { id: `seed-verification-${slug}`, deadline: verificationDeadlineAt(verificationStartedAt), reminderSent: false },
      // A seeded Neuzulassung's verification id was never issued, so polling it would fail every tick.
      polling: service === "deregistration" && status === "submitted_to_kba" ? { nextPollAt: CREATED_AT, attempts: 1 } : application.polling,
    },
    statusToken: `seed-status-link-${slug}`,
  }
}

export const seededApplications = (journeys: { [Service in OrderableService]?: Partial<Record<ApplicationStatus, Journey>> }): SeededApplication[] =>
  Object.entries(journeys).flatMap(([service, byStatus]) =>
    Object.entries(byStatus).map(([status, journey]) => seeded(service as OrderableService, status as ApplicationStatus, journey)),
  )

export const SEEDED_APPLICATIONS: readonly SeededApplication[] = seededApplications(JOURNEYS)
