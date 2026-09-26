import { Money } from "./money"
import { refundPolicy } from "./refund-policy"

const euros = (amount: number) => Money.ofCents(Math.round(amount * 100))

const TOTAL = euros(69.99)
const held = { state: "held", total: TOTAL } as const
const captured = { state: "captured", total: TOTAL } as const

const summary = (decision: ReturnType<typeof refundPolicy>) => ({
  action: decision.action.kind,
  amount: "amount" in decision.action ? decision.action.amount.cents : undefined,
  retained: decision.retained.cents,
  returned: decision.returned.cents,
})

describe("refundPolicy (business logic §3)", () => {
  describe("process successful: full capture, no refund", () => {
    it("captures a held payment in full", () => {
      expect(summary(refundPolicy({ type: "completed" }, held))).toEqual({
        action: "capture", amount: 6999, retained: 6999, returned: 0,
      })
    })

    it("leaves an already captured payment alone", () => {
      expect(summary(refundPolicy({ type: "completed" }, captured))).toEqual({
        action: "none", amount: undefined, retained: 6999, returned: 0,
      })
    })
  })

  describe.each([
    ["customer cancels at 5b", { type: "cancelled" }],
    ["non-correctable error (5c)", { type: "failedFinal" }],
  ] as const)("%s: 19.99 € retained, the rest returned", (_, outcome) => {
    it("captures only the fee on a held payment, which releases the rest (Q8)", () => {
      expect(summary(refundPolicy(outcome, held))).toEqual({
        action: "capture", amount: 1999, retained: 1999, returned: 5000,
      })
    })

    it("refunds total minus the fee on a captured payment", () => {
      expect(summary(refundPolicy(outcome, captured))).toEqual({
        action: "refund", amount: 5000, retained: 1999, returned: 5000,
      })
    })
  })

  describe("technical error on our side: 100 % back", () => {
    it("releases a held payment", () => {
      expect(summary(refundPolicy({ type: "ourTechnicalError" }, held))).toEqual({
        action: "release", amount: undefined, retained: 0, returned: 6999,
      })
    })

    it("refunds a captured payment in full", () => {
      expect(summary(refundPolicy({ type: "ourTechnicalError" }, captured))).toEqual({
        action: "refund", amount: 6999, retained: 0, returned: 6999,
      })
    })
  })

  describe("customer corrects: charge the difference only, if any", () => {
    it("charges the extra amount when the corrected order costs more", () => {
      expect(summary(refundPolicy({ type: "corrected", newTotal: euros(79.99) }, captured))).toEqual({
        action: "chargeAdditional", amount: 1000, retained: 6999, returned: 0,
      })
    })

    it.each([euros(69.99), euros(59.99)])("charges nothing when it costs the same or less (%o)", (newTotal) => {
      expect(summary(refundPolicy({ type: "corrected", newTotal }, held)).action).toBe("none")
    })
  })

  it("refuses an order that does not exceed the processing fee, which cannot be priced", () => {
    expect(() => refundPolicy({ type: "cancelled" }, { state: "held", total: euros(19.99) })).toThrow(RangeError)
  })
})
