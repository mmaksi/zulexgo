import { advance, type ApplicationEvent, type ApplicationStatus } from "./application-status"
import type { ApplicationReference } from "./application-reference"
import type { DeregistrationRequest } from "./deregistration-request"
import type { Email } from "./email"
import type { Money } from "./money"
import type { IkfzStatus } from "./registration-authority"

export interface StatusChange {
  readonly status: ApplicationStatus
  readonly at: Date
}

/**
 * One de-registration order. Identified by its reference, which is also the
 * `order_id` sent to the payment provider. Changes return a new object; the
 * repository persists it and bumps `version`, so two writers cannot both win.
 */
export interface Application {
  readonly reference: ApplicationReference
  readonly version: number
  readonly status: ApplicationStatus
  readonly history: readonly StatusChange[]
  readonly request: DeregistrationRequest
  readonly email: Email
  readonly ikfzStatus: IkfzStatus
  /** One per checkout attempt, sent as `X-Idempotency-Key`, so a network retry never files twice. */
  readonly idempotencyKey: string
  readonly payment: { readonly id: string; readonly total: Money }
  readonly zulexApplicationId?: string
  /** Silent retries of a technical error already used; business logic §2 allows one. */
  readonly retryAttempts: number
  readonly polling: { readonly nextPollAt?: Date; readonly attempts: number }
}

export function applyEvent(application: Application, event: ApplicationEvent, now: Date): Application {
  const status = advance(application.status, event)
  if (status === application.status) return application

  return { ...application, status, history: [...application.history, { status, at: now }] }
}
