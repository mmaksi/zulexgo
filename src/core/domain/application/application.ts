import { advance, type ApplicationEvent, type ApplicationStatus } from "./application-status"
import type { ApplicationReference } from "./application-reference"
import type { ServiceRequest } from "./service"
import type { Email } from "@/src/core/domain/customer/email"
import type { Failure } from "@/src/core/domain/registration/failure"
import type { Money } from "@/src/core/domain/payment/money"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"

/** One entry of an application's history: a status it reached, and when. */
export interface StatusChange {
  readonly status: ApplicationStatus
  readonly at: Date
}

/**
 * One order, for the service its `request` names. Identified by its reference, which is also the
 * `order_id` sent to the payment provider. Changes return a new object; the
 * repository persists it and bumps `version`, so two writers cannot both win.
 */
export interface Application {
  readonly reference: ApplicationReference
  /**
   * What `update` checks: it succeeds only against the version this copy was read
   * at, otherwise `StaleApplication`.
   */
  readonly version: number
  readonly status: ApplicationStatus
  /**
   * Every status reached, oldest first, and when. The status page dates its steps
   * from it, since the vendor has no timestamps.
   */
  readonly history: readonly StatusChange[]
  /**
   * What the customer entered and Zulex receives; `request.service` says which service the
   * order is for. Its security codes print as a placeholder, never as the code.
   */
  readonly request: ServiceRequest
  /** The only address the status link and the status emails go to. */
  readonly email: Email
  /**
   * Of the authority behind the plate prefix, taken at checkout. It sets the poll
   * schedule and whether the card is captured once Zulex accepts the application.
   */
  readonly ikfzStatus: IkfzStatus
  /**
   * One per checkout attempt, sent as `X-Idempotency-Key`, so a network retry never
   * files twice. A correction that files the order afresh takes a new one.
   */
  readonly idempotencyKey: string
  /**
   * The payment provider's id for this order's payment, and what the customer paid
   * for the service. The provider holds the rest of the money's state.
   */
  readonly payment: { readonly id: string; readonly total: Money }
  /**
   * The registration service's id for an application it holds, recorded the moment
   * it accepts the submission (so while the status can still be `submitted_and_paid`)
   * and the handle for every later status check, retry and correction. Absent until then.
   */
  readonly zulexApplicationId?: string
  /**
   * Silent retries already used; business logic §2 allows one for a KBA technical error.
   * It also counts resubmissions of a submission the service never confirmed, which are
   * limited by time instead (`SUBMISSION_PATIENCE_MS`). Back to 0 once the application is
   * filed, and on a correction.
   */
  readonly retryAttempts: number
  /** Why the application is at 5b or 5c, so the page and the email can say so. Cleared when a correction resubmits it. */
  readonly failure?: Failure
  /**
   * When the poller next visits, and how many checks it has made, which indexes the delay
   * before the next one (`nextPollAt` in poll-schedule.ts). Without `nextPollAt` nothing is
   * scheduled: the order is unpaid, finished, or a 5b whose money is safe.
   */
  readonly polling: { readonly nextPollAt?: Date; readonly attempts: number }
}

/**
 * Moves the application one event along the status machine and records when. Only `status`
 * and `history` change; the caller sets `failure`, `polling` and the rest. An event that
 * keeps the status returns the same object and adds no history. Throws `InvalidTransition`
 * if the status refuses the event.
 */
export function applyEvent(application: Application, event: ApplicationEvent, now: Date): Application {
  const status = advance(application.status, event)
  if (status === application.status) return application

  return { ...application, status, history: [...application.history, { status, at: now }] }
}
