import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { Money } from "@/src/core/domain/money"
import { DEREGISTRATION_TOTAL } from "@/src/core/domain/pricing"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { CODES, MINUTE, setupFlow } from "./flow-harness"

/**
 * M6, J7: a card hold lasts 7 days, so money is taken in full before it can
 * lapse (launch plan Q7 and Q20, both still the founder's to confirm).
 */
const DAY = 24 * 60 * MINUTE
const { prefix } = FAKE_REQUEST.licencePlate

function setup(authority: "online" | "unavailable") {
  const flow = setupFlow()
  flow.deps.registration.setAuthorities(prefix, [{ kreiscode: "00000", ikfzStatus: authority }])
  const pollDays = async (days: number) => {
    for (let day = 0; day < days; day++) await flow.poll(DAY / MINUTE)
  }
  return { ...flow, pollDays }
}

describe("hold policy", () => {
  describe("an authority that works online", () => {
    it("takes the full amount as soon as Zulex accepts the application, before the KBA answers", async () => {
      const { stored, payment, checkoutAndPay } = setup("online")

      const reference = await checkoutAndPay("card")

      expect((await stored(reference)).status).toBe("submitted_to_kba")
      expect(await payment(reference)).toMatchObject({ status: "captured", captured: DEREGISTRATION_TOTAL })
    })
  })

  describe("an authority that works by hand", () => {
    it("holds the card while the KBA works, and takes it in full once the hold is within two days of lapsing", async () => {
      const { payment, pollDays, checkoutAndPay } = setup("unavailable")
      const reference = await checkoutAndPay("card")

      await pollDays(1)
      expect(await payment(reference)).toMatchObject({ status: "held" })

      await pollDays(3)
      expect(await payment(reference)).toMatchObject({ status: "held" })

      await pollDays(1)
      expect(await payment(reference)).toMatchObject({ status: "captured", captured: DEREGISTRATION_TOTAL })
    })

    it("completes an order after the early capture without taking anything twice", async () => {
      const { deps, stored, zulexId, payment, pollDays, checkoutAndPay } = setup("unavailable")
      const reference = await checkoutAndPay("card")
      await pollDays(5)
      deps.registration.setStatus(await zulexId(reference), { state: "finished", documents: [] })

      await pollDays(1)

      expect((await stored(reference)).status).toBe("completed")
      expect(await payment(reference)).toMatchObject({ status: "captured", captured: DEREGISTRATION_TOTAL, refunded: Money.ofCents(0) })
    })

    it("returns all but the fee after the early capture, when the KBA then refuses for good", async () => {
      const { deps, stored, zulexId, payment, pollDays, checkoutAndPay } = setup("unavailable")
      const reference = await checkoutAndPay("card")
      await pollDays(5)
      deps.registration.setStatus(await zulexId(reference), { state: "failed", error: { code: 202, details: [] }, documents: [] })

      await pollDays(1)

      expect((await stored(reference)).status).toBe("failed_final")
      const paid = await payment(reference)
      expect(paid.captured.subtract(paid.refunded).cents).toBe(1999)
    })
  })

  describe("a 5b that waits for the customer", () => {
    it.each(["online", "unavailable"] as const)(
      "keeps checking the hold of a %s authority's refused order daily, takes it before it lapses, then stops checking",
      async (authority) => {
        const { deps, stored, payment, pollDays, checkoutAndPay } = setup(authority)
        deps.registration.failNext("submit", new GatewayRejected())
        const reference = await checkoutAndPay("card")
        expect((await stored(reference)).status).toBe("failed_correctable")
        expect((await payment(reference)).status).toBe("held")

        await pollDays(4)
        expect((await payment(reference)).status).toBe("held")
        expect((await stored(reference)).polling.nextPollAt).toBeDefined()

        await pollDays(1)
        expect((await payment(reference)).status).toBe("captured")
        expect((await stored(reference)).polling.nextPollAt).toBeUndefined()
        expect((await stored(reference)).status).toBe("failed_correctable")
      },
    )
  })

  describe("a hold that lapsed anyway (the poller was down for days)", () => {
    const warnings = () => jest.spyOn(console, "warn").mockImplementation(() => {})

    it("still completes the order the KBA finished, absorbing the loss, and says so once, naming the order", async () => {
      const warn = warnings()
      const { deps, clock, stored, zulexId, payment, poll, checkoutAndPay } = setup("unavailable")
      const reference = await checkoutAndPay("card")
      clock.advance(8 * DAY)
      deps.registration.setStatus(await zulexId(reference), { state: "finished", documents: [] })

      const result = await poll(0)

      expect(result).toEqual({ checked: 1, failed: 0 })
      expect((await stored(reference)).status).toBe("completed")
      expect((await payment(reference)).status).toBe("released")
      expect((await stored(reference)).polling.nextPollAt).toBeUndefined()
      expect((await poll(60)).checked).toBe(0)
      const logged = warn.mock.calls.flat().join(" ")
      expect(logged).toContain(reference)
      for (const code of CODES) expect(logged).not.toContain(code)
      warn.mockRestore()
    })

    it("fails the order for good when the KBA refuses it, returning everything since nothing was kept", async () => {
      const warn = warnings()
      const { deps, clock, emails, stored, zulexId, poll, checkoutAndPay } = setup("unavailable")
      const reference = await checkoutAndPay("card")
      clock.advance(8 * DAY)
      deps.registration.setStatus(await zulexId(reference), { state: "failed", error: { code: 202, details: [] }, documents: [] })

      const result = await poll(0)

      expect(result).toEqual({ checked: 1, failed: 0 })
      expect((await stored(reference)).status).toBe("failed_final")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba", "rejected", "refundIssued"])
      expect(deps.mailer.sent.at(-1)?.template).toMatchObject({ amount: DEREGISTRATION_TOTAL })
      warn.mockRestore()
    })
  })
})
