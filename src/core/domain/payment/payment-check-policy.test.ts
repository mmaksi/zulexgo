import { CARD_HOLD_LIFETIME_MS } from "./hold-policy"
import { firstPaymentCheckAt, nextPaymentCheckAt } from "./payment-check-policy"

const MINUTE = 60_000
const ORDERED_AT = new Date("2026-03-01T09:00:00.000Z")
const after = (ms: number) => new Date(ORDERED_AT.getTime() + ms)

describe("the poller's look at an order whose payment notification may have been lost", () => {
  it("leaves the first quarter hour to the webhook", () => {
    expect(firstPaymentCheckAt(ORDERED_AT)).toEqual(after(15 * MINUTE))
  })

  it("looks again an hour after each look", () => {
    expect(nextPaymentCheckAt(ORDERED_AT, after(15 * MINUTE))).toEqual(after(75 * MINUTE))
  })

  it("keeps looking while a hold taken at checkout could still be live, and stops once none could be", () => {
    expect(nextPaymentCheckAt(ORDERED_AT, after(CARD_HOLD_LIFETIME_MS - 1))).toBeDefined()
    expect(nextPaymentCheckAt(ORDERED_AT, after(CARD_HOLD_LIFETIME_MS))).toBeUndefined()
  })
})
