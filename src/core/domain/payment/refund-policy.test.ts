import { Money } from "./money"
import { PROCESSING_FEE } from "./pricing"
import { refundPolicy, retainedOf, settledDecision } from "./refund-policy"

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

  describe("the customer never verified their identity before the deadline: 100 % back, nothing was filed", () => {
    it("releases a held payment", () => {
      expect(summary(refundPolicy({ type: "verificationExpired" }, held))).toEqual({
        action: "release", amount: undefined, retained: 0, returned: 6999,
      })
    })

    it("refunds a captured payment in full, the fee included", () => {
      expect(summary(refundPolicy({ type: "verificationExpired" }, captured))).toEqual({
        action: "refund", amount: 6999, retained: 0, returned: 6999,
      })
    })
  })

  it("refuses an order that does not exceed the processing fee, which cannot be priced", () => {
    expect(() => refundPolicy({ type: "cancelled" }, { state: "held", total: euros(19.99) })).toThrow(RangeError)
  })
})

describe("settledDecision: what a rerun finds already done", () => {
  const paid = (status: "held" | "captured" | "released", capturedCents: number, refundedCents = 0) => ({
    status,
    total: TOTAL,
    captured: Money.ofCents(capturedCents),
    refunded: Money.ofCents(refundedCents),
  })

  it.each(["cancelled", "failedFinal"] as const)("reports an earlier refund beyond the fee for %s without trying to take money back", (type) => {
    const decision = settledDecision({ type }, paid("captured", 6999, 6000))
    expect(decision).toEqual({ action: { kind: "none" }, retained: Money.ofCents(999), returned: Money.ofCents(6000) })
  })

  it.each([
    ["a hold captured down to the fee", paid("captured", 1999)],
    ["a captured payment refunded down to the fee", paid("captured", 6999, 5000)],
  ])("finds the fee already retained after %s", (_, payment) => {
    expect(summary(settledDecision({ type: "failedFinal" }, payment)!)).toEqual({
      action: "none", amount: undefined, retained: 1999, returned: 5000,
    })
    expect(settledDecision({ type: "cancelled" }, payment)).toBeDefined()
  })

  it.each([
    ["a hold that was released", paid("released", 0)],
    ["a captured payment refunded in full", paid("captured", 6999, 6999)],
  ])("finds our technical error already settled after %s", (_, payment) => {
    expect(summary(settledDecision({ type: "ourTechnicalError" }, payment)!)).toEqual({
      action: "none", amount: undefined, retained: 0, returned: 6999,
    })
  })

  it.each([
    ["a payment still held", paid("held", 0)],
    ["a payment captured in full", paid("captured", 6999)],
  ])("finds nothing done yet on %s when the fee should be kept", (_, payment) => {
    expect(settledDecision({ type: "failedFinal" }, payment)).toBeUndefined()
  })

  describe("a hold that lapsed before the outcome (Q20: the customer keeps everything, the fee is lost)", () => {
    it.each([{ type: "completed" }, { type: "cancelled" }, { type: "failedFinal" }, { type: "ourTechnicalError" }] as const)(
      "finds %o settled with nothing retained, since the money already went back",
      (outcome) => {
        expect(summary(settledDecision(outcome, paid("released", 0))!)).toEqual({
          action: "none", amount: undefined, retained: 0, returned: 6999,
        })
      },
    )
  })

  it.each(["ourTechnicalError", "verificationExpired"] as const)(
    "finds nothing done on a hold or a payment that still holds money when %s should all go back",
    (type) => {
      expect(settledDecision({ type }, paid("held", 0))).toBeUndefined()
      expect(settledDecision({ type }, paid("captured", 6999))).toBeUndefined()
      expect(settledDecision({ type }, paid("captured", PROCESSING_FEE.cents))).toBeUndefined()
    },
  )

  it.each([
    ["a hold that was released", paid("released", 0)],
    ["a captured payment refunded in full", paid("captured", 6999, 6999)],
  ])("finds an expired verification already settled after %s", (_, payment) => {
    expect(summary(settledDecision({ type: "verificationExpired" }, payment)!)).toEqual({
      action: "none", amount: undefined, retained: 0, returned: 6999,
    })
  })

  it("leaves a completed order to the policy itself, which already skips a captured payment", () => {
    expect(settledDecision({ type: "completed" }, paid("captured", 6999))).toBeUndefined()
  })
})

describe("retainedOf", () => {
  const record = (captured: number, refunded: number) => ({ captured: Money.ofCents(captured), refunded: Money.ofCents(refunded) })

  it("is what was taken and not given back", () => {
    expect(retainedOf(record(6999, 5000)).cents).toBe(1999)
  })

  it("is nothing when a provider reports a reversal of money that was never taken, rather than failing", () => {
    expect(retainedOf(record(0, 6999)).cents).toBe(0)
  })

  it("lets settledDecision see a released hold through such a report", () => {
    const released = { status: "released", total: TOTAL, ...record(0, 6999) } as const

    expect(settledDecision({ type: "ourTechnicalError" }, released)).toBeDefined()
    expect(settledDecision({ type: "failedFinal" }, released)?.retained.cents).toBe(0)
  })
})
