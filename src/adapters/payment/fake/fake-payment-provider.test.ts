import { anApplication } from "@/tests/fixtures/applications"
import { Money } from "@/src/core/domain/money"
import { HoldExpired } from "@/src/core/errors/hold-expired"
import type { Clock } from "@/src/core/ports/clock"
import { paymentProviderContract } from "@/src/core/ports/payment-provider.contract"
import { FakePaymentProvider } from "./fake-payment-provider"

/** Adapters may not import each other, so this test keeps its own movable clock. */
function movableClock(start: Date) {
  let now = start.getTime()
  const clock: Clock = { now: () => new Date(now) }
  return { clock, advance: (milliseconds: number) => (now += milliseconds) }
}

paymentProviderContract("FakePaymentProvider", () => {
  const provider = new FakePaymentProvider(movableClock(new Date("2026-03-01T09:00:00.000Z")).clock)
  return {
    provider,
    customerPays: (id, method) => provider.customerPays(id, method),
    notificationOfPayment: async (id) => provider.notificationOfPayment(id),
  }
})

const DAY = 24 * 60 * 60 * 1000

describe("FakePaymentProvider hold expiry, driven by the clock", () => {
  it("releases a card hold after seven days, and a late capture fails", async () => {
    const { clock, advance } = movableClock(new Date("2026-03-01T09:00:00.000Z"))
    const provider = new FakePaymentProvider(clock)
    const { reference, email } = anApplication()
    const { paymentId } = await provider.createPayment({ reference, amount: Money.ofCents(6999), email })
    await provider.customerPays(paymentId, "card")

    expect((await provider.getPayment(paymentId)).holdExpiresAt).toEqual(new Date("2026-03-08T09:00:00.000Z"))

    advance(7 * DAY)

    expect((await provider.getPayment(paymentId)).status).toBe("released")
    await expect(provider.capture(paymentId, Money.ofCents(6999))).rejects.toBeInstanceOf(HoldExpired)
  })
})
