import type { ApplicationStatus } from "./application-status"
import { orderReport, type OrderTrail } from "./order-report"

const NOW = new Date("2026-03-10T12:00:00.000Z")
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000)

function trail(statuses: ApplicationStatus[], options: { hours?: number; deadlineInHours?: number } = {}): OrderTrail {
  const first = options.hours ?? 48
  return {
    status: statuses.at(-1)!,
    history: statuses.map((status, index) => ({ status, at: hoursAgo(first - index) })),
    verificationDeadline: options.deadlineInHours === undefined ? undefined : hoursAgo(-options.deadlineInHours),
  }
}

const sentToVerify = ["awaiting_payment", "submitted_and_paid", "awaiting_identity_verification"] as const

describe("the orders by where they stand", () => {
  it("counts every status, with zero for the ones nobody is in", () => {
    const report = orderReport([trail(["awaiting_payment"]), trail(["awaiting_payment", "submitted_and_paid"]), trail(["awaiting_payment", "submitted_and_paid"])], NOW)

    expect(report.orders).toBe(3)
    expect(report.byStatus).toMatchObject({ awaiting_payment: 1, submitted_and_paid: 2, completed: 0, failed_final: 0 })
  })

  it("is all zero for no orders, with no share or rate to divide by", () => {
    const report = orderReport([], NOW)

    expect(report.orders).toBe(0)
    expect(report.failedFinalShare).toBeUndefined()
    expect(report.verification).toMatchObject({ sent: 0, waiting: 0, stuck: 0, failureRate: undefined, abandonmentRate: undefined })
  })
})

describe("orders waiting for the customer's identity", () => {
  it("counts those still within their deadline as waiting, and those past it as stuck: the poller should have ended them", () => {
    const report = orderReport(
      [
        trail([...sentToVerify], { deadlineInHours: 20 }),
        trail([...sentToVerify], { deadlineInHours: 1 }),
        trail([...sentToVerify], { deadlineInHours: -1 }),
        trail([...sentToVerify], { deadlineInHours: -30 }),
      ],
      NOW,
    )

    expect(report.verification).toMatchObject({ sent: 4, waiting: 2, stuck: 2 })
  })

  it("does not count an order that moved on as waiting, even though it once did", () => {
    const report = orderReport([trail([...sentToVerify, "identity_verified"], { deadlineInHours: -5 })], NOW)

    expect(report.verification).toMatchObject({ sent: 1, waiting: 0, stuck: 0 })
  })

  it("treats a deadline that was never recorded as not yet passed, not as stuck", () => {
    expect(orderReport([trail([...sentToVerify])], NOW).verification).toMatchObject({ waiting: 1, stuck: 0 })
  })
})

describe("how verifications ended", () => {
  const verified = trail([...sentToVerify, "identity_verified", "submitted_to_kba"])
  const mismatched = trail([...sentToVerify, "failed_correctable"])
  const failed = trail([...sentToVerify, "failed_final"])
  const expired = trail([...sentToVerify, "cancelled"])
  const unresolved = trail([...sentToVerify], { deadlineInHours: 10 })

  it("tells the outcome of the first verification from the status that followed it", () => {
    const report = orderReport([verified, verified, mismatched, failed, expired, unresolved], NOW)

    expect(report.verification).toMatchObject({ sent: 6, verified: 2, mismatched: 1, failed: 1, expired: 1, unresolved: 1 })
  })

  it("gives the failure and abandonment rates among the verifications that ended, not those still waiting", () => {
    const report = orderReport([verified, verified, mismatched, failed, expired, unresolved], NOW)

    expect(report.verification.failureRate).toBeCloseTo(2 / 5)
    expect(report.verification.abandonmentRate).toBeCloseTo(1 / 5)
  })

  it("keeps a mismatch that was corrected and verified as the mismatch it first was", () => {
    const corrected = trail([...sentToVerify, "failed_correctable", "awaiting_identity_verification", "identity_verified", "completed"])

    expect(orderReport([corrected], NOW).verification).toMatchObject({ mismatched: 1, verified: 0 })
  })

  it("counts no verification for an order that never went to verify, as a de-registration never does", () => {
    const direct = trail(["awaiting_payment", "submitted_and_paid", "submitted_to_kba", "completed"])

    expect(orderReport([direct], NOW).verification).toMatchObject({ sent: 0, verified: 0 })
  })
})

describe("how many orders end as a 5c", () => {
  const completed = trail(["awaiting_payment", "submitted_and_paid", "submitted_to_kba", "completed"])
  const refused = trail(["awaiting_payment", "submitted_and_paid", "submitted_to_kba", "failed_final"])

  it("is the share of the orders the registration service decided that it refused for good", () => {
    const report = orderReport([completed, completed, completed, refused], NOW)

    expect(report).toMatchObject({ completed: 3, failedFinal: 1 })
    expect(report.failedFinalShare).toBeCloseTo(1 / 4)
  })

  it("leaves out what is still undecided: a correctable order, a cancelled one, one at the KBA", () => {
    const report = orderReport([completed, trail(["awaiting_payment", "submitted_and_paid", "submitted_to_kba"]), trail(["awaiting_payment", "submitted_and_paid", "failed_correctable"])], NOW)

    expect(report.failedFinalShare).toBe(0)
  })
})
