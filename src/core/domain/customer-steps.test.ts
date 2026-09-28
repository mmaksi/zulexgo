import { anApplication } from "@/tests/fixtures/applications"
import { applyEvent, type Application } from "./application"
import type { ApplicationEvent } from "./application-status"
import { customerSteps } from "./customer-steps"

const T0 = new Date("2026-03-01T09:00:00.000Z")
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000)

/** Walks the real status machine, one minute per event, so every history is one the app can produce. */
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
