import type { StatusChange } from "./application"
import { APPLICATION_STATUSES, type ApplicationStatus } from "./application-status"

/**
 * What the monitoring numbers read of an order: where it stands and how it got there. Never what the
 * customer entered, so a report can be read, kept and shipped to a monitoring tool without personal data.
 */
export interface OrderTrail {
  readonly status: ApplicationStatus
  readonly history: readonly StatusChange[]
  /** Where the order's identity verification ends, once it was started. */
  readonly verificationDeadline?: Date
}

type FirstOutcome = "verified" | "mismatched" | "failed" | "expired"

/** What the first verification of an order came to, by the status that followed it. */
const OUTCOME_AFTER: Partial<Record<ApplicationStatus, FirstOutcome>> = {
  identity_verified: "verified",
  // Found someone other than the owner (Q47): nothing was filed and the customer may correct the name.
  failed_correctable: "mismatched",
  failed_final: "failed",
  // The deadline passed: the customer never verified.
  cancelled: "expired",
}

export interface VerificationReport {
  /** Orders that were sent to verify. */
  readonly sent: number
  /** How the first verification of each came out; `unresolved` is still waiting. They add up to `sent`. */
  readonly verified: number
  readonly mismatched: number
  readonly failed: number
  readonly expired: number
  readonly unresolved: number
  /** Orders at the verification step now, within their deadline. */
  readonly waiting: number
  /** Orders at the verification step now whose deadline has passed: the poller should have ended them. */
  readonly stuck: number
  /** Of the verifications that ended: the share that did not match or failed. Absent while none has ended. */
  readonly failureRate?: number
  /** Of the verifications that ended: the share the customer let run out. */
  readonly abandonmentRate?: number
}

export interface OrderReport {
  readonly orders: number
  readonly byStatus: Readonly<Record<ApplicationStatus, number>>
  readonly verification: VerificationReport
  readonly completed: number
  /** Refused for good (a 5c), at the KBA or before. */
  readonly failedFinal: number
  /** Of the orders the registration service decided: the share it refused for good. Absent while none is decided. */
  readonly failedFinalShare?: number
}

const share = (part: number, whole: number) => (whole === 0 ? undefined : part / whole)

function firstOutcome(history: readonly StatusChange[]): FirstOutcome | "unresolved" | undefined {
  const sent = history.findIndex(({ status }) => status === "awaiting_identity_verification")
  if (sent === -1) return undefined
  const next = history[sent + 1]?.status
  return (next && OUTCOME_AFTER[next]) || "unresolved"
}

/** The numbers an operator watches over `trails` (the orders of one service in a window), as of `now`. */
export function orderReport(trails: readonly OrderTrail[], now: Date): OrderReport {
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<ApplicationStatus, number>
  const outcomes = { verified: 0, mismatched: 0, failed: 0, expired: 0, unresolved: 0 }
  let sent = 0
  let waiting = 0
  let stuck = 0

  for (const trail of trails) {
    byStatus[trail.status] += 1

    const outcome = firstOutcome(trail.history)
    if (outcome) {
      sent += 1
      outcomes[outcome] += 1
    }

    if (trail.status === "awaiting_identity_verification") {
      if (trail.verificationDeadline && trail.verificationDeadline < now) stuck += 1
      else waiting += 1
    }
  }

  const ended = sent - outcomes.unresolved
  return {
    orders: trails.length,
    byStatus,
    verification: {
      sent,
      ...outcomes,
      waiting,
      stuck,
      failureRate: share(outcomes.mismatched + outcomes.failed, ended),
      abandonmentRate: share(outcomes.expired, ended),
    },
    completed: byStatus.completed,
    failedFinal: byStatus.failed_final,
    failedFinalShare: share(byStatus.failed_final, byStatus.completed + byStatus.failed_final),
  }
}
