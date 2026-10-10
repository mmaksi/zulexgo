import { advance, isTerminal, type ApplicationEvent, type ApplicationStatus } from "./application-status"
import type { ApplicationReference } from "./application-reference"
import type { Consent } from "./consent"
import { withoutCodes, type StoredDeregistrationRequest } from "./deregistration-request"
import { withoutBankAccount, type StoredNewRegistrationRequest } from "./new-registration-request"
import type { Service, ServiceRequest } from "./service"
import type { Email } from "@/src/core/domain/customer/email"
import type { Failure } from "@/src/core/domain/registration/failure"
import type { Money } from "@/src/core/domain/payment/money"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"

export interface StatusChange {
  readonly status: ApplicationStatus
  readonly at: Date
}

export interface Application {
  readonly reference: ApplicationReference
  readonly version: number
  readonly status: ApplicationStatus
  readonly history: readonly StatusChange[]
  readonly request: ServiceRequest
  readonly email: Email
  /** Absent only on orders made before consent was recorded (seeded ones); checkout always sets it. */
  readonly consent?: Consent
  readonly ikfzStatus: IkfzStatus
  /** Zulex's `X-Idempotency-Key`, so a retry never files twice; a correction that refiles takes a new one. */
  readonly idempotencyKey: string
  readonly payment: { readonly id: string; readonly total: Money }
  /** Set the moment Zulex accepts the submission, so possibly while still `submitted_and_paid`. */
  readonly zulexApplicationId?: string
  readonly retryAttempts: number
  readonly failure?: Failure
  readonly identityVerification?: { readonly id: string; readonly deadline: Date; readonly reminderSent: boolean }
  readonly polling: { readonly nextPollAt?: Date; readonly attempts: number }
}

export const filingDueSince = (history: readonly StatusChange[]): Date | undefined =>
  history.findLast(({ status }) => status === "submitted_and_paid" || status === "identity_verified")?.at

export const verificationStartedAt = (history: readonly StatusChange[]): Date | undefined =>
  history.findLast(({ status }) => status === "awaiting_identity_verification")?.at

type Moving = Pick<Application, "status" | "history"> & { readonly request: { readonly service: Service } }

// Provisional: launch plan Q22, Q54: an order that ends forgets its security codes and bank account.
export function applyEvent<Order extends Moving>(application: Order, event: ApplicationEvent, now: Date): Order {
  const identityVerified = application.history.some(({ status }) => status === "identity_verified")
  const status = advance(application.status, event, { service: application.request.service, identityVerified })
  const moved = { ...application, status, history: [...application.history, { status, at: now }] }
  return isTerminal(status) ? withoutFilingSecrets(moved) : moved
}

function withoutFilingSecrets<Order extends Moving>(order: Order): Order {
  switch (order.request.service) {
    case "deregistration":
      return { ...order, request: withoutCodes(order.request as StoredDeregistrationRequest) }
    case "newRegistration":
      return { ...order, request: withoutBankAccount(order.request as StoredNewRegistrationRequest) }
    default:
      return order
  }
}
