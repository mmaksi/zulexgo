import type { Application } from "./application"
import type { ApplicationStatus } from "./application-status"

/**
 * What the last step can show: 5a, 5b, 5c, or a 5b the customer cancelled. 5b is not terminal
 * (a correction sends the order back to the KBA), but the journey waits there for the customer.
 */
const OUTCOMES = ["completed", "failed_correctable", "failed_final", "cancelled"] as const satisfies ApplicationStatus[]

export type Outcome = (typeof OUTCOMES)[number]
/** `failed` only ever marks the outcome step, for every outcome except `completed`. */
export type StepState = "pending" | "current" | "done" | "failed"

export interface CustomerStep {
  /** Business logic statuses 1, 4 and 5 (5a | 5b | 5c); Verimi's 2 and 3 slot in after `paid` when it is added. */
  readonly id: "paid" | "kba" | "outcome"
  readonly state: StepState
  /** When the application last reached the step, from our own history: the vendor has no timestamps. */
  readonly at?: Date
  /** Which outcome, on the outcome step once it has one. */
  readonly outcome?: Outcome
}

const isOutcome = (status: ApplicationStatus): status is Outcome => (OUTCOMES as readonly string[]).includes(status)

/**
 * The stepper on the status page, derived from our status machine alone: always the same three
 * steps, in order. `paid` is current only while payment is awaited (a status the customer never
 * sees) and done after. `kba` is current while the order is at the KBA, done once an order that
 * reached the KBA has ended, and pending otherwise, so an order refused before the KBA ever
 * held it never shows it as done. Each `at` is the latest time the order reached that status,
 * so a corrected order that returns to the KBA shows the newer time.
 */
export function customerSteps({ status, history }: Application): CustomerStep[] {
  const reachedAt = (wanted: ApplicationStatus) => history.findLast((change) => change.status === wanted)?.at
  const kbaAt = reachedAt("submitted_to_kba")

  const paid: CustomerStep =
    status === "awaiting_payment" ? { id: "paid", state: "current" } : { id: "paid", state: "done", at: reachedAt("submitted_and_paid") }

  const kba: CustomerStep =
    status === "submitted_to_kba"
      ? { id: "kba", state: "current", at: kbaAt }
      : kbaAt && isOutcome(status)
        ? { id: "kba", state: "done", at: kbaAt }
        : { id: "kba", state: "pending" }

  const outcome: CustomerStep = isOutcome(status)
    ? { id: "outcome", state: status === "completed" ? "done" : "failed", at: reachedAt(status), outcome: status }
    : { id: "outcome", state: "pending" }

  return [paid, kba, outcome]
}
