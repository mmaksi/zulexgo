import type { Application } from "./application"
import { requiresIdentityVerification, type ApplicationStatus } from "./application-status"
import type { Service } from "./service"

/**
 * What the last step can show: 5a, 5b, 5c, or a 5b the customer cancelled (or a verification that
 * ran out). 5b is not terminal (a correction sends the order back to the KBA), but the journey
 * waits there for the customer.
 */
const OUTCOMES = ["completed", "failed_correctable", "failed_final", "cancelled"] as const satisfies ApplicationStatus[]

export type Outcome = (typeof OUTCOMES)[number]
/** `failed` only ever marks the outcome step, for every outcome except `completed`. */
export type StepState = "pending" | "current" | "done" | "failed"

export interface CustomerStep {
  /**
   * Business logic statuses 1 to 5 (5a | 5b | 5c): `paid` is 1, `verification` the wait for the customer's
   * identity (2) and `verified` the confirmed identity (3), both only for a service that verifies, `kba` is 4.
   */
  readonly id: "paid" | "verification" | "verified" | "kba" | "outcome"
  readonly state: StepState
  /** When the application last reached the step, from our own history: the vendor has no timestamps. */
  readonly at?: Date
  /** Which outcome, on the outcome step once it has one. */
  readonly outcome?: Outcome
  /** On the outcome step of an order cancelled because the customer did not verify in time, not because they gave up. */
  readonly verificationExpired?: true
}

/** What the stepper reads of an order: where it is, how it got there, and which service it is for. */
type SteppedOrder = Pick<Application, "status" | "history"> & { readonly request: { readonly service: Service } }

const isOutcome = (status: ApplicationStatus): status is Outcome => (OUTCOMES as readonly string[]).includes(status)

/**
 * The stepper on the status page, derived from our status machine alone, in order: `paid`,
 * `kba` and `outcome` for a service that goes straight to the KBA, and `verification` and `verified`
 * between `paid` and `kba` for one that verifies the customer's identity first. `paid` is current
 * only while payment is awaited (a status the customer never sees) and done after. `verification` is
 * current while the order waits for the customer to verify, `verified` while a verified order is not
 * yet filed; each is done once the identity has been verified, and pending otherwise, so an order that
 * ended without a verified identity never shows them as done. `kba` is current while the order is at
 * the KBA, done once an order that reached the KBA has ended, and pending otherwise, so an order
 * refused before the KBA ever held it never shows it as done. Each `at` is the latest time the order
 * reached that status, so a corrected order that returns to a step shows the newer time.
 */
export function customerSteps({ status, history, request }: SteppedOrder): CustomerStep[] {
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

  // A customer cancels from 5b; only a verification that ran out cancels an order straight from status 2.
  const ranOut = status === "cancelled" && history.at(-2)?.status === "awaiting_identity_verification"
  const outcome: CustomerStep = isOutcome(status)
    ? { id: "outcome", state: status === "completed" ? "done" : "failed", at: reachedAt(status), outcome: status, ...(ranOut ? { verificationExpired: true } : {}) }
    : { id: "outcome", state: "pending" }

  if (!requiresIdentityVerification(request.service)) return [paid, kba, outcome]

  const verifiedAt = reachedAt("identity_verified")

  const verification: CustomerStep =
    status === "awaiting_identity_verification"
      ? { id: "verification", state: "current", at: reachedAt("awaiting_identity_verification") }
      : verifiedAt
        ? { id: "verification", state: "done", at: reachedAt("awaiting_identity_verification") }
        : { id: "verification", state: "pending" }

  const verified: CustomerStep =
    status === "identity_verified"
      ? { id: "verified", state: "current", at: verifiedAt }
      : verifiedAt
        ? { id: "verified", state: "done", at: verifiedAt }
        : { id: "verified", state: "pending" }

  return [paid, verification, verified, kba, outcome]
}
