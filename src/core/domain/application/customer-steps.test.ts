import { anApplication } from "@/tests/fixtures/applications"
import { applyEvent, type Application } from "./application"
import type { ApplicationEvent, ApplicationStatus } from "./application-status"
import { customerSteps } from "./customer-steps"
import type { Service } from "./service"

const T0 = new Date("2026-03-01T09:00:00.000Z")
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000)

function reached(...events: ApplicationEvent[]): Application {
  return events.reduce(
    (application, event, index) => applyEvent(application, event, minutes(index + 1)),
    anApplication({ status: "awaiting_payment", history: [{ status: "awaiting_payment", at: T0 }] }),
  )
}

const states = (application: Application) => customerSteps(application).map((step) => step.state)

describe("customerSteps: statuses 1 → 4 → 5 as the customer sees them", () => {
  it("shows payment as the current step until it is confirmed", () => {
    expect(states(reached())).toEqual(["current", "pending", "pending"])
  })

  it("dates each step by when the application reached it", () => {
    const steps = customerSteps(reached("paymentConfirmed", "submittedToKba"))

    expect(steps.map((step) => step.at)).toEqual([minutes(1), minutes(2), undefined])
    expect(states(reached("paymentConfirmed", "submittedToKba"))).toEqual(["done", "current", "pending"])
  })

  it("marks the outcome done on completion", () => {
    const completed = reached("paymentConfirmed", "submittedToKba", "kbaCompleted")

    expect(customerSteps(completed)).toEqual([
      { id: "paid", state: "done", at: minutes(1) },
      { id: "kba", state: "done", at: minutes(2) },
      { id: "outcome", state: "done", at: minutes(3), outcome: "completed" },
    ])
  })

  it.each([
    ["failed_correctable", ["failedCorrectable"]],
    ["failed_final", ["failedFinal"]],
    ["cancelled", ["failedCorrectable", "cancelledByCustomer"]],
  ] as const)("marks the outcome failed at %s", (outcome, events) => {
    const steps = customerSteps(reached("paymentConfirmed", "submittedToKba", ...events))

    expect(steps[2]).toMatchObject({ state: "failed", outcome, at: minutes(2 + events.length) })
  })

  it("leaves the KBA step pending when the submission failed before reaching the KBA", () => {
    expect(states(reached("paymentConfirmed", "failedFinal"))).toEqual(["done", "pending", "failed"])
  })

  it("keeps the KBA step current while a correction is back at the KBA", () => {
    const resubmitted = reached("paymentConfirmed", "submittedToKba", "failedCorrectable", "correctionResubmitted")

    expect(states(resubmitted)).toEqual(["done", "current", "pending"])
  })
})

function reachedBy(service: Service, ...events: ApplicationEvent[]) {
  const first = { status: "awaiting_payment" as ApplicationStatus, history: [{ status: "awaiting_payment" as ApplicationStatus, at: T0 }], request: { service } }
  return events.reduce((order, event, index) => applyEvent(order, event, minutes(index + 1)), first)
}

const verified = (...events: ApplicationEvent[]) => reachedBy("newRegistration", ...events)
const VERIFY = ["paymentConfirmed", "identityVerificationStarted"] as const
const VERIFIED = [...VERIFY, "identityVerified"] as const
const FILED = [...VERIFIED, "submittedToKba"] as const

describe("customerSteps for a service that verifies identity: statuses 1 → 2 → 3 → 4 → 5", () => {
  const stepStates = (order: ReturnType<typeof verified>) => customerSteps(order).map((step) => `${step.id}:${step.state}`)

  it("has five steps, and a de-registration still has three", () => {
    expect(customerSteps(verified()).map((step) => step.id)).toEqual(["paid", "verification", "verified", "kba", "outcome"])
    expect(customerSteps(reached()).map((step) => step.id)).toEqual(["paid", "kba", "outcome"])
  })

  it("shows payment as the current step until it is confirmed", () => {
    expect(stepStates(verified())).toEqual(["paid:current", "verification:pending", "verified:pending", "kba:pending", "outcome:pending"])
  })

  it("is between payment and verification the instant payment is confirmed", () => {
    expect(stepStates(verified("paymentConfirmed"))).toEqual(["paid:done", "verification:pending", "verified:pending", "kba:pending", "outcome:pending"])
  })

  it("shows the verification as the current step while the customer has not verified", () => {
    expect(stepStates(verified(...VERIFY))).toEqual(["paid:done", "verification:current", "verified:pending", "kba:pending", "outcome:pending"])
  })

  it("shows the verified identity as the current step, until the order is filed", () => {
    expect(stepStates(verified(...VERIFIED))).toEqual(["paid:done", "verification:done", "verified:current", "kba:pending", "outcome:pending"])
  })

  it("shows the KBA as the current step once filed", () => {
    expect(stepStates(verified(...FILED))).toEqual(["paid:done", "verification:done", "verified:done", "kba:current", "outcome:pending"])
  })

  it("dates each step by when the order reached it", () => {
    const steps = customerSteps(verified(...FILED))

    expect(steps.map((step) => step.at)).toEqual([minutes(1), minutes(2), minutes(3), minutes(4), undefined])
  })

  it("completes", () => {
    const steps = customerSteps(verified(...FILED, "kbaCompleted"))

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done", "done", "done"])
    expect(steps[4]).toMatchObject({ outcome: "completed", at: minutes(5) })
  })

  describe("when the verification does not succeed, the outcome says why and the later steps stay pending", () => {
    it.each([
      ["failed_final", ["identityVerificationFailed"]],
      ["cancelled", ["identityVerificationExpired"]],
      ["failed_correctable", ["failedCorrectable"]],
    ] as const)("ending at %s", (outcome, events) => {
      const order = verified(...VERIFY, ...events)

      expect(stepStates(order)).toEqual(["paid:done", "verification:pending", "verified:pending", "kba:pending", "outcome:failed"])
      expect(customerSteps(order)[4]).toMatchObject({ outcome })
    })
  })

  describe("an order sent back to be checked again after a correction", () => {
    const rechecked = () => verified(...VERIFY, "failedCorrectable", "correctionRechecked")

    it("flags the verification step, which is current again but is not the customer's to do", () => {
      expect(customerSteps(rechecked())[1]).toMatchObject({ id: "verification", state: "current", rechecking: true })
    })

    it("does not flag a first wait, nor an order that has moved on", () => {
      expect(customerSteps(verified(...VERIFY))[1].rechecking).toBeUndefined()
      expect(customerSteps(verified(...VERIFIED))[1].rechecking).toBeUndefined()
      expect(customerSteps(verified(...VERIFY, "failedCorrectable", "correctionRechecked", "identityVerified"))[1].rechecking).toBeUndefined()
    })
  })

  describe("a cancelled order says whether the customer gave up or the verification ran out", () => {
    it("flags a verification that ran out", () => {
      expect(customerSteps(verified(...VERIFY, "identityVerificationExpired"))[4]).toMatchObject({ outcome: "cancelled", verificationExpired: true })
    })

    it("does not flag a cancel by the customer, after a mismatch or after the KBA refused the filing", () => {
      expect(customerSteps(verified(...VERIFY, "failedCorrectable", "cancelledByCustomer"))[4].verificationExpired).toBeUndefined()
      expect(customerSteps(verified(...FILED, "failedCorrectable", "cancelledByCustomer"))[4].verificationExpired).toBeUndefined()
    })

    it("does not flag a de-registration's cancel, so its steps read as before", () => {
      const cancelled = reached("paymentConfirmed", "submittedToKba", "failedCorrectable", "cancelledByCustomer")

      expect(customerSteps(cancelled)[2]).not.toHaveProperty("verificationExpired")
    })
  })

  it("leaves the KBA step pending when the filing was refused before the KBA held it, the identity still verified", () => {
    expect(stepStates(verified(...VERIFIED, "failedCorrectable"))).toEqual([
      "paid:done",
      "verification:done",
      "verified:done",
      "kba:pending",
      "outcome:failed",
    ])
  })

  it("returns to the verified identity, with the newer time, when a refused filing is corrected and filed afresh", () => {
    const refiled = verified(...VERIFIED, "failedCorrectable", "correctionRefiled")

    expect(stepStates(refiled)).toEqual(["paid:done", "verification:done", "verified:current", "kba:pending", "outcome:pending"])
    expect(customerSteps(refiled)[2].at).toEqual(minutes(5))
  })

  it("keeps the KBA step current while a correction is back at the KBA", () => {
    const resubmitted = verified(...FILED, "failedCorrectable", "correctionResubmitted")

    expect(stepStates(resubmitted)).toEqual(["paid:done", "verification:done", "verified:done", "kba:current", "outcome:pending"])
  })
})
