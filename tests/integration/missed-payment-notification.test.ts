import { FAKE_CONSENTS, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { advanceStatus } from "@/src/core/use-cases/registration/advance-status"
import { DAY, MINUTE, setupFlow } from "./flow-harness"

const unpaidCheckout = (flow: ReturnType<typeof setupFlow>) =>
  submitCheckout(flow.deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test", consents: FAKE_CONSENTS, acknowledgedDuplicate: true })

describe("a payment whose notification never arrived", () => {
  it("is confirmed and filed by the poller once the order is 15 minutes old", async () => {
    const flow = setupFlow()
    const reference = await flow.payForCheckout()

    expect(await flow.poll(14)).toEqual({ checked: 0, failed: 0 })
    expect((await flow.stored(reference)).status).toBe("awaiting_payment")
    expect(flow.emails()).toEqual([])

    expect(await flow.poll(1)).toEqual({ checked: 1, failed: 0 })
    expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba"])
    expect(flow.deps.registration.submissions).toHaveLength(1)
  })

  it("is retried every hour while the mail provider refuses email 1, with the status link it already issued", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    try {
      const flow = setupFlow()
      const reference = await flow.payForCheckout()
      const send = jest.spyOn(flow.deps.mailer, "send").mockRejectedValue(new Error("Resend refused the message"))

      expect(await flow.poll(15)).toEqual({ checked: 1, failed: 1 })
      const issued = await flow.deps.repository.getStatusToken(reference)
      expect(await flow.poll(59)).toEqual({ checked: 0, failed: 0 })
      expect(send).toHaveBeenCalledTimes(1)

      send.mockRestore()
      expect(await flow.poll(1)).toEqual({ checked: 1, failed: 0 })

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba"])
      expect(await flow.deps.repository.getStatusToken(reference)).toBe(issued)
    } finally {
      error.mockRestore()
    }
  })

  it("leaves an order the customer never paid alone, asking the payment provider hourly until a hold could no longer be live", async () => {
    const flow = setupFlow()
    const { reference } = await unpaidCheckout(flow)
    const getPayment = jest.spyOn(flow.deps.payments, "getPayment")

    await flow.poll(15)
    await flow.poll(30)
    expect(getPayment).toHaveBeenCalledTimes(1)

    await flow.poll(30)
    expect(getPayment).toHaveBeenCalledTimes(2)

    await flow.poll((8 * DAY) / MINUTE)
    expect(getPayment).toHaveBeenCalledTimes(3)

    expect(await flow.poll(60)).toEqual({ checked: 0, failed: 0 })
    expect(await flow.poll(DAY / MINUTE)).toEqual({ checked: 0, failed: 0 })
    expect(getPayment).toHaveBeenCalledTimes(3)
    expect((await flow.stored(reference)).status).toBe("awaiting_payment")
    expect(flow.emails()).toEqual([])
  })

  it("leaves the order as the webhook saved it when the webhook confirmed it while the poller was looking", async () => {
    const flow = setupFlow()
    const reference = await flow.payForCheckout()
    const loadedByThePoller = await flow.stored(reference)
    await flow.confirm(reference)
    const confirmed = await flow.stored(reference)

    await advanceStatus(flow.deps, loadedByThePoller)

    expect(await flow.stored(reference)).toEqual(confirmed)
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba"])
    expect(flow.deps.registration.submissions).toHaveLength(1)
  })

  it("files an order once when the webhook and the poller confirm it at the same moment", async () => {
    const flow = setupFlow()
    const reference = await flow.payForCheckout()
    const loadedByThePoller = await flow.stored(reference)

    await Promise.allSettled([flow.confirm(reference), advanceStatus(flow.deps, loadedByThePoller)])

    expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba"])
    expect(flow.deps.registration.submissions).toHaveLength(1)
  })
})
