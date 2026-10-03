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

/** Owned by the test, not imported: business logic §1–§3 for a service that goes 1 → 4 (de-registration, Q4). */
const DIRECT: Move[] = [
  ["awaiting_payment", "paymentConfirmed", "submitted_and_paid"],
  ["submitted_and_paid", "submittedToKba", "submitted_to_kba"],
  ["submitted_and_paid", "failedCorrectable", "failed_correctable"],
  ["submitted_and_paid", "failedFinal", "failed_final"],
  ["submitted_to_kba", "kbaProcessing", "submitted_to_kba"],
  ["submitted_to_kba", "kbaCompleted", "completed"],
  ["submitted_to_kba", "failedCorrectable", "failed_correctable"],
  ["submitted_to_kba", "failedFinal", "failed_final"],
  ["failed_correctable", "correctionResubmitted", "submitted_to_kba"],
  ["failed_correctable", "correctionRefiled", "submitted_and_paid"],
  ["failed_correctable", "cancelledByCustomer", "cancelled"],
]

/**
 * Business logic §1–§3 for a service that verifies the customer's identity between payment (1) and
 * filing (4), through statuses 2 and 3 (Neuzulassung, launch plan Q45, provisional). These moves hold
 * whether or not the identity was verified yet. `submitted_and_paid --failedFinal-->` is the way out when
 * the verification cannot be started at all (our fault, so a full refund, as an unconfirmed filing is).
 */
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
  ["submitted_to_kba", "kbaProcessing", "submitted_to_kba"],
  ["submitted_to_kba", "kbaCompleted", "completed"],
  ["submitted_to_kba", "failedCorrectable", "failed_correctable"],
  ["submitted_to_kba", "failedFinal", "failed_final"],
  ["failed_correctable", "cancelledByCustomer", "cancelled"],
]

/**
 * An order whose identity was never verified (a 5b that a mismatch caused, launch plan Q47, provisional) can only
 * be sent back to be checked again: nothing may file it, patch it or refile it.
 */
const NEVER_VERIFIED: Move[] = [...VERIFIED_ANY, ["failed_correctable", "correctionRechecked", "awaiting_identity_verification"]]

/**
 * An order whose identity was verified once never needs it again: a refused filing is refiled back to 3, not 1, and what
 * the KBA holds is patched. Nothing is filed before 3, so filing starts there.
 */
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

/**
 * Every state an order of the service can reach by any sequence of events from the first status, together with whether the
 * identity was ever verified, tracked as the app does it: by having entered status 3 (`identityVerified` below is the
 * event that actually verified it).
 */
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

  // The security property of the step: the KBA registers a car in a named person's name only after that person was verified.
  // Every sequence of events is tried, including a verification mismatch that is corrected and refiled.
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

  // The poller visits status 2 for the deadline, the reminder and the card hold; status 3 so an order whose filing
  // was interrupted is resumed, as one at status 1 is.
  it.each(IDENTITY_STATUSES)("includes %s, paid and not finished", (status) => {
    expect(OPEN_STATUSES).toContain(status)
    expect(POLLED_STATUSES).toContain(status)
  })

  it.each(["awaiting_payment", "completed", "failed_final", "cancelled"] as const)("leaves out %s", (status) => {
    expect(OPEN_STATUSES).not.toContain(status)
    expect(POLLED_STATUSES).not.toContain(status)
  })
})
