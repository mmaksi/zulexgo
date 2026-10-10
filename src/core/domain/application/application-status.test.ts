import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"
import {
  APPLICATION_EVENTS,
  APPLICATION_STATUSES,
  OPEN_STATUSES,
  POLLED_STATUSES,
  advance,
  filedFrom,
  isTerminal,
  requiresIdentityVerification,
  type ApplicationEvent,
  type ApplicationStatus,
} from "./application-status"
import { SERVICES, type Service } from "./service"

type Move = [ApplicationStatus, ApplicationEvent, ApplicationStatus]

// Owned by the test, not imported, so a changed move in the source fails it. Launch plan Q4.
const DIRECT: Move[] = [
  ["awaiting_payment", "paymentConfirmed", "submitted_and_paid"],
  ["submitted_and_paid", "submittedToKba", "submitted_to_kba"],
  ["submitted_and_paid", "failedCorrectable", "failed_correctable"],
  ["submitted_and_paid", "failedFinal", "failed_final"],
  ["submitted_to_kba", "kbaCompleted", "completed"],
  ["submitted_to_kba", "failedCorrectable", "failed_correctable"],
  ["submitted_to_kba", "failedFinal", "failed_final"],
  ["failed_correctable", "correctionResubmitted", "submitted_to_kba"],
  ["failed_correctable", "correctionRefiled", "submitted_and_paid"],
  ["failed_correctable", "cancelledByCustomer", "cancelled"],
]

// Provisional: launch plan Q45
const VERIFIED_ANY: Move[] = [
  ["awaiting_payment", "paymentConfirmed", "submitted_and_paid"],
  ["submitted_and_paid", "identityVerificationStarted", "awaiting_identity_verification"],
  ["submitted_and_paid", "failedFinal", "failed_final"],
  ["awaiting_identity_verification", "identityVerified", "identity_verified"],
  ["awaiting_identity_verification", "identityVerificationFailed", "failed_final"],
  ["awaiting_identity_verification", "identityVerificationExpired", "cancelled"],
  ["awaiting_identity_verification", "failedCorrectable", "failed_correctable"],
  ["identity_verified", "failedCorrectable", "failed_correctable"],
  ["identity_verified", "failedFinal", "failed_final"],
  ["submitted_to_kba", "kbaCompleted", "completed"],
  ["submitted_to_kba", "failedCorrectable", "failed_correctable"],
  ["submitted_to_kba", "failedFinal", "failed_final"],
  ["failed_correctable", "cancelledByCustomer", "cancelled"],
]

// Provisional: launch plan Q47
const NEVER_VERIFIED: Move[] = [...VERIFIED_ANY, ["failed_correctable", "correctionRechecked", "awaiting_identity_verification"]]

const VERIFIED_ONCE: Move[] = [
  ...VERIFIED_ANY,
  ["identity_verified", "submittedToKba", "submitted_to_kba"],
  ["failed_correctable", "correctionResubmitted", "submitted_to_kba"],
  ["failed_correctable", "correctionRefiled", "identity_verified"],
]

const JOURNEYS: [Service, boolean, Move[]][] = [
  ["deregistration", false, DIRECT],
  ["deregistration", true, DIRECT],
  ["newRegistration", false, NEVER_VERIFIED],
  ["newRegistration", true, VERIFIED_ONCE],
]

const IDENTITY_STATUSES: ApplicationStatus[] = ["awaiting_identity_verification", "identity_verified"]

function explore(service: Service) {
  const key = (state: { status: ApplicationStatus; entered: boolean; verifiedByEvent: boolean }) => JSON.stringify(state)
  const seen = new Map([[key({ status: "awaiting_payment", entered: false, verifiedByEvent: false }), { status: "awaiting_payment" as ApplicationStatus, entered: false, verifiedByEvent: false }]])
  const queue = [...seen.values()]
  for (const state of queue) {
    for (const event of APPLICATION_EVENTS) {
      let status: ApplicationStatus
      try {
        status = advance(state.status, event, { service, identityVerified: state.entered })
      } catch (error) {
        if (error instanceof InvalidTransition) continue
        throw error
      }
      const next = { status, entered: state.entered || status === "identity_verified", verifiedByEvent: state.verifiedByEvent || event === "identityVerified" }
      if (!seen.has(key(next))) {
        seen.set(key(next), next)
        queue.push(next)
      }
    }
  }
  return [...seen.values()]
}

describe.each(JOURNEYS)("advance, for %s, identity verified: %s", (service, identityVerified, legal) => {
  const isLegal = (status: ApplicationStatus, event: ApplicationEvent) => legal.some(([from, on]) => from === status && on === event)
  const illegal = APPLICATION_STATUSES.flatMap((status) =>
    APPLICATION_EVENTS.filter((event) => !isLegal(status, event)).map((event) => [status, event] as const),
  )

  it.each(legal)("%s --%s--> %s", (from, event, to) => {
    expect(advance(from, event, { service, identityVerified })).toBe(to)
  })

  it.each(illegal)("rejects %s --%s-->", (from, event) => {
    expect(() => advance(from, event, { service, identityVerified })).toThrow(InvalidTransition)
  })
})

describe("which services verify the customer's identity", () => {
  it("is every service but de-registration, so a service added later is never filed unverified by default (launch plan Q4, Q45)", () => {
    expect(requiresIdentityVerification("deregistration")).toBe(false)
    for (const service of SERVICES.filter((service) => service !== "deregistration")) expect(requiresIdentityVerification(service)).toBe(true)
  })
})

describe("the path of each service", () => {
  it("never takes a de-registration through identity verification: it goes from 1 straight to the KBA", () => {
    const statuses = new Set(explore("deregistration").map(({ status }) => status))

    for (const status of IDENTITY_STATUSES) expect(statuses.has(status)).toBe(false)
    expect([...statuses].sort()).toEqual(APPLICATION_STATUSES.filter((status) => !IDENTITY_STATUSES.includes(status)).sort())
  })

  it("takes a Neuzulassung through every status", () => {
    expect([...new Set(explore("newRegistration").map(({ status }) => status))].sort()).toEqual([...APPLICATION_STATUSES].sort())
  })

  it("never lets a Neuzulassung reach status 3, the KBA or completion without the verification event having happened", () => {
    const unverified = explore("newRegistration").filter(
      ({ status, verifiedByEvent }) => ["identity_verified", "submitted_to_kba", "completed"].includes(status) && !verifiedByEvent,
    )

    expect(unverified).toEqual([])
  })

  it("lets a mismatch be corrected and checked again, but never filed or patched without a verified identity", () => {
    const mismatch = { service: "newRegistration", identityVerified: false } as const

    expect(advance("failed_correctable", "correctionRechecked", mismatch)).toBe("awaiting_identity_verification")
    for (const event of ["submittedToKba", "correctionResubmitted", "correctionRefiled"] as const) {
      expect(() => advance("failed_correctable", event, mismatch)).toThrow(InvalidTransition)
    }
  })

  it("does not send an order that was already verified to be checked again", () => {
    expect(() => advance("failed_correctable", "correctionRechecked", { service: "newRegistration", identityVerified: true })).toThrow(InvalidTransition)
  })

  it("never lets a de-registration take a verification event", () => {
    const journey = { service: "deregistration", identityVerified: false } as const
    for (const event of ["identityVerificationStarted", "identityVerified", "identityVerificationFailed", "identityVerificationExpired", "correctionRechecked"] as const) {
      for (const status of APPLICATION_STATUSES) expect(() => advance(status, event, journey)).toThrow(InvalidTransition)
    }
  })
})

describe("filedFrom: the status an order is filed from", () => {
  it.each(SERVICES)("is, for %s, the one status the machine accepts the filing event from", (service) => {
    const accepting = APPLICATION_STATUSES.filter((status) => {
      try {
        advance(status, "submittedToKba", { service, identityVerified: true })
        return true
      } catch {
        return false
      }
    })

    expect(accepting).toEqual([filedFrom(service)])
  })

  it("is 1 for a de-registration and 3 for a Neuzulassung", () => {
    expect(filedFrom("deregistration")).toBe("submitted_and_paid")
    expect(filedFrom("newRegistration")).toBe("identity_verified")
  })
})

describe("isTerminal", () => {
  it.each(APPLICATION_STATUSES)("%s is terminal exactly when no event leaves it, on any path", (status) => {
    const hasExit = JOURNEYS.some(([, , moves]) => moves.some(([from]) => from === status))

    expect(isTerminal(status)).toBe(!hasExit)
  })

  it("ends at completed, failed_final and cancelled", () => {
    expect(APPLICATION_STATUSES.filter(isTerminal)).toEqual(["completed", "failed_final", "cancelled"])
  })
})

describe("the statuses that are looked at on a schedule, or that a second order collides with", () => {
  it("keeps the journey's order, so the stepper reads 1, 2, 3, 4, 5 from the list", () => {
    expect(APPLICATION_STATUSES.slice(0, 5)).toEqual([
      "awaiting_payment",
      "submitted_and_paid",
      "awaiting_identity_verification",
      "identity_verified",
      "submitted_to_kba",
    ])
  })

  it.each(IDENTITY_STATUSES)("includes %s, paid and not finished", (status) => {
    expect(OPEN_STATUSES).toContain(status)
    expect(POLLED_STATUSES).toContain(status)
  })

  it.each(["completed", "failed_final", "cancelled"] as const)("leaves out %s", (status) => {
    expect(OPEN_STATUSES).not.toContain(status)
    expect(POLLED_STATUSES).not.toContain(status)
  })
})
