import { anApplication } from "@/tests/fixtures/applications"
import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"
import { applyEvent } from "./application"

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
})
