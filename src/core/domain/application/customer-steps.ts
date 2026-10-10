import type { Application } from "./application"
import { requiresIdentityVerification, type ApplicationStatus } from "./application-status"
import type { Service } from "./service"

const OUTCOMES = ["completed", "failed_correctable", "failed_final", "cancelled"] as const satisfies ApplicationStatus[]

export type Outcome = (typeof OUTCOMES)[number]
export type StepState = "pending" | "current" | "done" | "failed"

export interface CustomerStep {
  readonly id: "paid" | "verification" | "verified" | "kba" | "outcome"
  readonly state: StepState
  readonly at?: Date
  readonly outcome?: Outcome
  readonly verificationExpired?: true
  readonly rechecking?: true
}

type SteppedOrder = Pick<Application, "status" | "history"> & { readonly request: { readonly service: Service } }

const isOutcome = (status: ApplicationStatus): status is Outcome => (OUTCOMES as readonly string[]).includes(status)

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

  const ranOut = status === "cancelled" && history.at(-2)?.status === "awaiting_identity_verification"
  const outcome: CustomerStep = isOutcome(status)
    ? { id: "outcome", state: status === "completed" ? "done" : "failed", at: reachedAt(status), outcome: status, ...(ranOut ? { verificationExpired: true } : {}) }
    : { id: "outcome", state: "pending" }

  if (!requiresIdentityVerification(request.service)) return [paid, kba, outcome]

  const verifiedAt = reachedAt("identity_verified")

  const rechecking = status === "awaiting_identity_verification" && history.at(-2)?.status === "failed_correctable"
  const verification: CustomerStep =
    status === "awaiting_identity_verification"
      ? { id: "verification", state: "current", at: reachedAt("awaiting_identity_verification"), ...(rechecking ? { rechecking: true } : {}) }
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
