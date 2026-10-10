import { aNewRegistrationApplication, anApplication } from "@/tests/fixtures/applications"
import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"
import { applyEvent, filingDueSince, type StatusChange } from "./application"
import type { ApplicationEvent, ApplicationStatus } from "./application-status"
import type { Service } from "./service"

const NOW = new Date("2026-03-01T09:00:00.000Z")
const LATER = new Date("2026-03-01T09:05:00.000Z")

describe("applyEvent", () => {
  it("moves the status and records when it changed", () => {
    const paid = applyEvent(anApplication({ status: "awaiting_payment" }), "paymentConfirmed", NOW)

    expect(paid.status).toBe("submitted_and_paid")
    expect(paid.history.at(-1)).toEqual({ status: "submitted_and_paid", at: NOW })
  })

  it("records nothing when an event keeps the status, so a poll tick adds no history", () => {
    const submitted = applyEvent(anApplication({ status: "submitted_and_paid" }), "submittedToKba", NOW)
    const polled = applyEvent(submitted, "kbaProcessing", LATER)

    expect(polled.history).toEqual(submitted.history)
  })

  it("leaves the original untouched", () => {
    const original = anApplication({ status: "awaiting_payment" })

    applyEvent(original, "paymentConfirmed", NOW)

    expect(original.status).toBe("awaiting_payment")
    expect(original.history).toHaveLength(1)
  })

  it("refuses an event the status machine does not allow", () => {
    expect(() => applyEvent(anApplication({ status: "completed" }), "cancelledByCustomer", NOW)).toThrow(
      InvalidTransition,
    )
  })

  // The path is the order's service's own: a de-registration is never sent to verify its customer.
  it("refuses a verification event on a de-registration, which goes from 1 straight to the KBA", () => {
    expect(() => applyEvent(anApplication({ status: "submitted_and_paid" }), "identityVerificationStarted", NOW)).toThrow(
      InvalidTransition,
    )
  })
})

/**
 * A Neuzulassung cannot be built as an `Application` yet (its request is not a `ServiceRequest` until it is
 * stored), and the machine reads only the status, the history and the service.
 */
function orderOf(service: Service, ...events: ApplicationEvent[]) {
  const first = { status: "awaiting_payment" as ApplicationStatus, history: [{ status: "awaiting_payment" as ApplicationStatus, at: NOW }], request: { service } }
  return events.reduce((order, event, index) => applyEvent(order, event, new Date(NOW.getTime() + (index + 1) * 60_000)), first)
}

describe("applyEvent, for a service that verifies the customer's identity", () => {
  const VERIFY = ["paymentConfirmed", "identityVerificationStarted"] as const
  const MISMATCH = [...VERIFY, "failedCorrectable"] as const
  const VERIFIED = [...VERIFY, "identityVerified"] as const

  it("walks 1 → 2 → 3 → 4 → 5a", () => {
    const completed = orderOf("newRegistration", ...VERIFIED, "submittedToKba", "kbaCompleted")

    expect(completed.history.map(({ status }) => status)).toEqual([
      "awaiting_payment",
      "submitted_and_paid",
      "awaiting_identity_verification",
      "identity_verified",
      "submitted_to_kba",
      "completed",
    ])
  })

  it("refuses to file an order that was never verified", () => {
    expect(() => orderOf("newRegistration", "paymentConfirmed", "submittedToKba")).toThrow(InvalidTransition)
  })

  describe("a 5b that a verification mismatch caused (nothing was verified, nothing was filed)", () => {
    it.each(["correctionResubmitted", "correctionRefiled"] as const)("cannot be %s, which would file it unverified", (event) => {
      expect(() => orderOf("newRegistration", ...MISMATCH, event)).toThrow(InvalidTransition)
    })

    it("is checked again once corrected, and can then be verified and filed", () => {
      const filed = orderOf("newRegistration", ...MISMATCH, "correctionRechecked", "identityVerified", "submittedToKba")

      expect(filed.status).toBe("submitted_to_kba")
    })

    it("can still be cancelled", () => {
      expect(orderOf("newRegistration", ...MISMATCH, "cancelledByCustomer").status).toBe("cancelled")
    })
  })

  describe("a 5b after the identity was verified", () => {
    const REFUSED = [...VERIFIED, "failedCorrectable"] as const

    it("is refiled back to status 3, not verified again", () => {
      const refiled = orderOf("newRegistration", ...REFUSED, "correctionRefiled")

      expect(refiled.status).toBe("identity_verified")
      expect(() => orderOf("newRegistration", ...REFUSED, "correctionRechecked")).toThrow(InvalidTransition)
    })

    it("stays verified however often it is refused and refiled", () => {
      const again = orderOf("newRegistration", ...REFUSED, "correctionRefiled", "failedCorrectable", "correctionRefiled", "submittedToKba")

      expect(again.status).toBe("submitted_to_kba")
    })

    it("is patched once the KBA holds it", () => {
      expect(orderOf("newRegistration", ...VERIFIED, "submittedToKba", "failedCorrectable", "correctionResubmitted").status).toBe("submitted_to_kba")
    })
  })
})

// Launch plan Q54, provisional: the account is held for the vehicle tax and nothing else, so it goes with the order that held it.
describe("applyEvent, once a Neuzulassung's order has ended", () => {
  const PAID = ["paymentConfirmed", "identityVerificationStarted"] as const
  const AT_THE_KBA = [...PAID, "identityVerified", "submittedToKba"] as const
  const walk = (...events: ApplicationEvent[]) =>
    events.reduce((order, event, index) => applyEvent(order, event, new Date(NOW.getTime() + (index + 1) * 60_000)), aNewRegistrationApplication())

  it.each([
    ["completed (5a)", [...AT_THE_KBA, "kbaCompleted"]],
    ["failed for good (5c)", [...AT_THE_KBA, "failedFinal"]],
    ["failed its identity verification (5c)", [...PAID, "identityVerificationFailed"]],
    ["was cancelled at 5b", [...AT_THE_KBA, "failedCorrectable", "cancelledByCustomer"]],
    ["ran out of time to verify", [...PAID, "identityVerificationExpired"]],
  ] as const)("holds no bank account once it %s", (_, events) => {
    const ended = walk(...events)

    expect(ended.request).not.toHaveProperty("bankAccount")
  })

  it.each([
    ["is paid", ["paymentConfirmed"]],
    ["waits to be verified", PAID],
    ["is at the KBA", AT_THE_KBA],
    ["is at 5b, where a refiled order is sent again with it", [...AT_THE_KBA, "failedCorrectable"]],
  ] as const)("holds it while it %s", (_, events) => {
    expect(walk(...events).request.bankAccount.reveal().iban).toBe("DE89370400440532013000")
  })

  it("keeps the rest of what was entered, and the order's own history", () => {
    const open = walk(...AT_THE_KBA)
    const ended = applyEvent(open, "kbaCompleted", NOW)

    expect(ended.request).toEqual({ ...open.request, bankAccount: undefined })
    expect(ended.request.owner.address.reveal().postcode).toBe("10115")
    expect(ended.history.at(-1)).toEqual({ status: "completed", at: NOW })
  })

  it("leaves the order it was given untouched", () => {
    const open = walk(...AT_THE_KBA)

    applyEvent(open, "kbaCompleted", NOW)

    expect(open.request.bankAccount.reveal().iban).toBe("DE89370400440532013000")
  })
})

// Launch plan Q22, provisional: the codes prove possession for one filing, and an order that has ended is never filed again.
describe("applyEvent, once a de-registration's order has ended", () => {
  const walk = (...events: ApplicationEvent[]) =>
    events.reduce((order, event, index) => applyEvent(order, event, new Date(NOW.getTime() + (index + 1) * 60_000)), anApplication({ status: "submitted_to_kba" }))

  it.each([
    ["completed (5a)", ["kbaCompleted"]],
    ["failed for good (5c)", ["failedFinal"]],
    ["was cancelled at 5b", ["failedCorrectable", "cancelledByCustomer"]],
  ] as const)("holds no security codes once it %s", (_, events) => {
    expect(walk(...events).request).not.toHaveProperty("codes")
  })

  it("holds them at 5b, where a correction files the order again", () => {
    const { request } = walk("failedCorrectable")

    expect(request.service === "deregistration" && request.codes?.rearPlate.reveal()).toBe("AA1")
  })

  it("keeps the plate and the VIN", () => {
    const open = anApplication({ status: "submitted_to_kba" })
    const ended = applyEvent(open, "kbaCompleted", NOW)

    expect(ended.request).toEqual({ ...open.request, codes: undefined })
  })
})

describe("filingDueSince: when an order last became ready to be filed", () => {
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000)
  const history = (...entries: [ApplicationStatus, number][]): StatusChange[] => entries.map(([status, minutes]) => ({ status, at: at(minutes) }))

  it("is when the order was paid, for a service that goes straight to the KBA", () => {
    expect(filingDueSince(history(["awaiting_payment", 0], ["submitted_and_paid", 1], ["submitted_to_kba", 2]))).toEqual(at(1))
  })

  // Filing for a Neuzulassung is days after payment: its patience for an unconfirmed filing must not already be used up.
  it("is when the identity was verified, for a service that verifies it first, not when it was paid", () => {
    const verified = history(["awaiting_payment", 0], ["submitted_and_paid", 1], ["awaiting_identity_verification", 2], ["identity_verified", 5000])

    expect(filingDueSince(verified)).toEqual(at(5000))
  })

  it("is the latest such time, so a refiled order starts again", () => {
    expect(filingDueSince(history(["submitted_and_paid", 1], ["failed_correctable", 2], ["submitted_and_paid", 3]))).toEqual(at(3))
    expect(filingDueSince(history(["submitted_and_paid", 1], ["identity_verified", 2], ["failed_correctable", 3], ["identity_verified", 4]))).toEqual(at(4))
  })

  it("is nothing for an order that was never paid", () => {
    expect(filingDueSince(history(["awaiting_payment", 0]))).toBeUndefined()
  })
})
