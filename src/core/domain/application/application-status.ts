import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"

/**
 * Our status machine, not the Zulex one: the API only knows IN_PROGRESS,
 * FINISHED and ERROR. Order is the customer's journey, so the stepper can
 * render from this list. Verimi (business logic steps 2–3) is added later;
 * when it lands, its statuses are inserted after `submitted_and_paid`.
 *
 * Against the business logic numbering: `submitted_and_paid` is 1, `submitted_to_kba` is 4,
 * `completed` is 5a, `failed_correctable` is 5b and `failed_final` is 5c. `cancelled` is a
 * 5b the customer gave up on.
 *
 * `awaiting_payment` is ours alone: the details are stored at checkout because
 * Stripe confirms payment later, by webhook. The customer never sees it — the
 * status link is only issued once payment is confirmed — and it sends no email.
 */
export const APPLICATION_STATUSES = [
  "awaiting_payment",
  "submitted_and_paid",
  "submitted_to_kba",
  "completed",
  "failed_correctable",
  "failed_final",
  "cancelled",
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

/**
 * What happened, already classified. The one silent retry of a technical error
 * is not an event: the customer sees nothing until the error algorithm decides.
 *
 * A correction reaches the KBA again by one of two ways: `correctionResubmitted`
 * patches an application the service already holds (back to status 4);
 * `correctionRefiled` files an application the service refused outright, and
 * so never held, like a new submission (back to status 1).
 *
 * `kbaProcessing` is the one event that keeps the status (still at the KBA), so it
 * adds nothing to the history.
 */
export const APPLICATION_EVENTS = [
  "paymentConfirmed",
  "submittedToKba",
  "kbaProcessing",
  "kbaCompleted",
  "failedCorrectable",
  "failedFinal",
  "correctionResubmitted",
  "correctionRefiled",
  "cancelledByCustomer",
] as const

export type ApplicationEvent = (typeof APPLICATION_EVENTS)[number]

/**
 * Every legal move and nothing else: an event a status has no entry for is refused. A
 * submission refused before the KBA held the application fails from `submitted_and_paid`
 * directly. The customer can cancel from `failed_correctable` only.
 */
const TRANSITIONS: Record<ApplicationStatus, Partial<Record<ApplicationEvent, ApplicationStatus>>> = {
  awaiting_payment: {
    paymentConfirmed: "submitted_and_paid",
  },
  submitted_and_paid: {
    submittedToKba: "submitted_to_kba",
    failedCorrectable: "failed_correctable",
    failedFinal: "failed_final",
  },
  submitted_to_kba: {
    kbaProcessing: "submitted_to_kba",
    kbaCompleted: "completed",
    failedCorrectable: "failed_correctable",
    failedFinal: "failed_final",
  },
  failed_correctable: {
    correctionResubmitted: "submitted_to_kba",
    correctionRefiled: "submitted_and_paid",
    cancelledByCustomer: "cancelled",
  },
  completed: {},
  failed_final: {},
  cancelled: {},
}

/**
 * The status an event leads to. Throws `InvalidTransition` when the status does not accept
 * the event, which is how a cancel or a correction on an order that is not at 5b is refused.
 */
export function advance(status: ApplicationStatus, event: ApplicationEvent): ApplicationStatus {
  const next = TRANSITIONS[status][event]
  if (!next) throw new InvalidTransition(status, event)
  return next
}

/** Paid and not finished: the orders a second order for the same vehicle would collide with (J8). */
export const OPEN_STATUSES: readonly ApplicationStatus[] = ["submitted_and_paid", "submitted_to_kba", "failed_correctable"]

/**
 * Looked at on a schedule: at the KBA, waiting for a silent resubmission after a
 * technical error, or (5b) waiting for the customer while the money is watched.
 * The repositories' `findDueForPolling` returns applications in these statuses only.
 */
export const POLLED_STATUSES: readonly ApplicationStatus[] = ["submitted_and_paid", "submitted_to_kba", "failed_correctable"]

/** No event moves it on: completed, failed for good, or cancelled. Derived from `TRANSITIONS`. */
export const isTerminal =(status: ApplicationStatus): boolean => Object.keys(TRANSITIONS[status]).length === 0
