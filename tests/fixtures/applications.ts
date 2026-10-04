import type { Application } from "@/src/core/domain/application/application"
import { parseApplicationReference } from "@/src/core/domain/application/application-reference"
import { parseDeregistrationRequest, type DeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { parseNewRegistrationRequest, type NewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import { emailSchema } from "@/src/core/domain/customer/email"
import { Money } from "@/src/core/domain/payment/money"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW } from "./new-registration"

/** Obviously fake values that still pass the same validation as production input. */
export const FAKE_REQUEST = {
  plateCount: 2,
  licencePlate: { prefix: "AAA", letters: "AA", numbers: "111" },
  vin: "FAKEVIN0000000001",
  codes: { rearPlate: "AA1", frontPlate: "AA2", certificate: "AAAAAA1" },
} as const

const CREATED_AT = new Date("2026-01-01T00:00:00.000Z")

let sequence = 0

/** An order known to be a de-registration, for a test that reads its plate or codes. */
export type DeregistrationApplication = Application & { readonly request: DeregistrationRequest }
/** An order known to be a Neuzulassung, for a test that reads its owner or eVB number. */
export type NewRegistrationApplication = Application & { readonly request: NewRegistrationRequest }

/** What every service's order has; each call gets its own reference and idempotency key. */
function anOrder(status: Application["status"]) {
  sequence += 1
  return {
    reference: parseApplicationReference(`ZG-${String(sequence).padStart(6, "0")}`),
    version: 0,
    status,
    history: [{ status, at: CREATED_AT }],
    email: emailSchema.parse(`customer-${sequence}@example.test`),
    ikfzStatus: "online" as const,
    idempotencyKey: `fake-idempotency-${sequence}`,
    payment: { id: `fake-payment-${sequence}`, total: Money.ofCents(4900) },
    retryAttempts: 0,
    polling: { attempts: 0 },
  }
}

/** A valid de-registration order in any status. */
export function anApplication(overrides: Partial<DeregistrationApplication> = {}): DeregistrationApplication {
  return { ...anOrder(overrides.status ?? "awaiting_payment"), request: parseDeregistrationRequest(FAKE_REQUEST), ...overrides }
}

/** A valid Neuzulassung order in any status, paid for at its own price. */
export function aNewRegistrationApplication(overrides: Partial<NewRegistrationApplication> = {}): NewRegistrationApplication {
  const order = anOrder(overrides.status ?? "awaiting_payment")
  return {
    ...order,
    request: parseNewRegistrationRequest(FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW),
    payment: { ...order.payment, total: SERVICE_PRICES.newRegistration },
    ...overrides,
  }
}
