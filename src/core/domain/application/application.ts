import { advance, type ApplicationEvent, type ApplicationStatus } from "./application-status"
import type { ApplicationReference } from "./application-reference"
import type { Consent } from "./consent"
import type { Service, ServiceRequest } from "./service"
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
   * What the customer agreed to at checkout and when (launch plan D9). Absent only on an order made
   * before it was recorded, such as dev's and staging's seeded ones; every order checkout makes has it.
   */
  readonly consent?: Consent
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
   * The identity verification a service that verifies (Neuzulassung) waits on: the provider's id, which
   * `getResult` is asked about, the moment the wait ends, and whether the reminder was sent. The deadline
   * is fixed when the verification starts, so the one in the customer's email is the one enforced if the
   * policy later changes. Absent until the verification starts, and kept once the order moves on.
   */
  readonly identityVerification?: { readonly id: string; readonly deadline: Date; readonly reminderSent: boolean }
  /**
   * When the poller next visits, and how many checks it has made, which indexes the delay
   * before the next one (`nextPollAt` in poll-schedule.ts). Without `nextPollAt` nothing is
   * scheduled: the order is unpaid, finished, or a 5b whose money is safe.
   */
  readonly polling: { readonly nextPollAt?: Date; readonly attempts: number }
}

/**
 * When the order last became ready to be filed: paid (status 1) or, for a service that verifies the
 * customer's identity first, verified (status 3), whichever came last. The latest, so an order that
 * is refiled starts again. Absent for an order that was never paid.
 */
export const filingDueSince = (history: readonly StatusChange[]): Date | undefined =>
  history.findLast(({ status }) => status === "submitted_and_paid" || status === "identity_verified")?.at

/** When the order last began waiting for the customer to verify: the reminder counts from here. A correction that sends it back to be checked again starts it over. */
export const verificationStartedAt = (history: readonly StatusChange[]): Date | undefined =>
  history.findLast(({ status }) => status === "awaiting_identity_verification")?.at

/** What the status machine reads of an order: where it is, how it got there, and which service it is for. */
type Moving = Pick<Application, "status" | "history"> & { readonly request: { readonly service: Service } }

/**
 * Moves the application one event along the status machine and records when. Only `status`
 * and `history` change; the caller sets `failure`, `polling` and the rest. An event that
 * keeps the status returns the same object and adds no history. Throws `InvalidTransition`
 * if the status refuses the event on the path of the order's service, given whether its
 * identity was ever verified (it has been when its history shows status 3).
 */
export function applyEvent<Order extends Moving>(application: Order, event: ApplicationEvent, now: Date): Order {
  const identityVerified = application.history.some(({ status }) => status === "identity_verified")
  const status = advance(application.status, event, { service: application.request.service, identityVerified })
  if (status === application.status) return application

  return { ...application, status, history: [...application.history, { status, at: now }] }
}
