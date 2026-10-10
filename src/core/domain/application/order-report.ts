import type { StatusChange } from "./application"
import { APPLICATION_STATUSES, type ApplicationStatus } from "./application-status"

// Never what the customer entered, so a report can be kept or shipped to monitoring without personal data.
export interface OrderTrail {
  readonly status: ApplicationStatus
  readonly history: readonly StatusChange[]
  readonly verificationDeadline?: Date
}

type FirstOutcome = "verified" | "mismatched" | "failed" | "expired"

const OUTCOME_AFTER: Partial<Record<ApplicationStatus, FirstOutcome>> = {
  identity_verified: "verified",
  // Provisional: launch plan Q47 (an owner mismatch is correctable)
  failed_correctable: "mismatched",
  failed_final: "failed",
  cancelled: "expired",
}

export interface VerificationReport {
  readonly sent: number
  readonly verified: number
  readonly mismatched: number
  readonly failed: number
  readonly expired: number
  readonly unresolved: number
  readonly waiting: number
  readonly stuck: number
  readonly failureRate?: number
  readonly abandonmentRate?: number
}

export interface OrderReport {
  readonly orders: number
  readonly byStatus: Readonly<Record<ApplicationStatus, number>>
  readonly verification: VerificationReport
  readonly completed: number
  readonly failedFinal: number
  readonly failedFinalShare?: number
}

const share = (part: number, whole: number) => (whole === 0 ? undefined : part / whole)

function firstOutcome(history: readonly StatusChange[]): FirstOutcome | "unresolved" | undefined {
  const sent = history.findIndex(({ status }) => status === "awaiting_identity_verification")
  if (sent === -1) return undefined
  const next = history[sent + 1]?.status
  return (next && OUTCOME_AFTER[next]) || "unresolved"
}

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
