import type { Application } from "@/src/core/domain/application/application"
import { parseApplicationReference } from "@/src/core/domain/application/application-reference"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { emailSchema } from "@/src/core/domain/customer/email"
import { Money } from "@/src/core/domain/payment/money"

/** Obviously fake values that still pass the same validation as production input. */
export const FAKE_REQUEST = {
  plateCount: 2,
  licencePlate: { prefix: "AAA", letters: "AA", numbers: "111" },
  vin: "FAKEVIN0000000001",
  codes: { rearPlate: "AA1", frontPlate: "AA2", certificate: "AAAAAA1" },
} as const

const CREATED_AT = new Date("2026-01-01T00:00:00.000Z")

let sequence = 0

/** A valid application in any status; each call gets its own reference and idempotency key. */
export function anApplication(overrides: Partial<Application> = {}): Application {
  sequence += 1
  const status = overrides.status ?? "awaiting_payment"
  return {
    reference: parseApplicationReference(`ZG-${String(sequence).padStart(6, "0")}`),
    version: 0,
    status,
    history: [{ status, at: CREATED_AT }],
    request: parseDeregistrationRequest(FAKE_REQUEST),
    email: emailSchema.parse(`customer-${sequence}@example.test`),
    ikfzStatus: "online",
    idempotencyKey: `fake-idempotency-${sequence}`,
    payment: { id: `fake-payment-${sequence}`, total: Money.ofCents(4900) },
    retryAttempts: 0,
    polling: { attempts: 0 },
    ...overrides,
  }
}
