import { Money } from "@/src/core/domain/payment/money"
import { PROCESSING_FEE, SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { cancelApplication } from "@/src/core/use-cases/application/cancel-application"
import { settlePayment } from "@/src/core/use-cases/payment/settle-payment"
import { keepServiceDown, setupFlow } from "./flow-harness"

describe("payment and polling recovery", () => {
  it.each(["cancelled", "ourTechnicalError"] as const)("accounts for a prior partial refund when settling %s", async (type) => {
    const flow = setupFlow()
    const reference = await flow.payForCheckout()
    const application = await flow.stored(reference)
    await flow.deps.payments.capture(application.payment.id, application.payment.total)
    await flow.deps.payments.refund(application.payment.id, Money.ofCents(100), "external-refund")

    const decision = await settlePayment(flow.deps, application, { type })

    const payment = await flow.payment(reference)
    const retained = type === "cancelled" ? PROCESSING_FEE : Money.ofCents(0)
    expect(payment.captured.subtract(payment.refunded)).toEqual(retained)
    expect(decision.retained).toEqual(retained)
    expect(decision.returned).toEqual(SERVICE_PRICES.deregistration.subtract(retained))
  })

  it.each(["partial capture", "partial refund", "wrong amount"])("does not file an order with a %s, and says so in the log", async (scenario) => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const flow = setupFlow()
    const reference = await flow.payForCheckout()
    const { payment } = await flow.stored(reference)
    if (scenario === "partial capture") await flow.deps.payments.capture(payment.id, PROCESSING_FEE)
    if (scenario === "partial refund") {
      await flow.deps.payments.capture(payment.id, SERVICE_PRICES.deregistration)
      await flow.deps.payments.refund(payment.id, Money.ofCents(100), "external-refund")
    }
    if (scenario === "wrong amount") {
      const getPayment = flow.deps.payments.getPayment.bind(flow.deps.payments)
      jest.spyOn(flow.deps.payments, "getPayment").mockImplementation(async (id) => ({
        ...await getPayment(id), amount: Money.ofCents(100),
      }))
    }

    await flow.confirm(reference)

    expect((await flow.stored(reference)).status).toBe("awaiting_payment")
    expect(flow.deps.registration.submissions).toHaveLength(0)
    expect(flow.emails()).toEqual([])
    expect(await flow.deps.repository.getStatusToken(reference)).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(reference))
    warn.mockRestore()
  })

  it("refunds the remainder when hold protection captures the whole payment during cancellation", async () => {
    const flow = setupFlow()
    flow.deps.registration.failNext("submit", new GatewayRejected())
    const reference = await flow.checkoutAndPay()
    const capture = flow.deps.payments.capture.bind(flow.deps.payments)
    jest.spyOn(flow.deps.payments, "capture").mockImplementationOnce(async (id, amount) => {
      await capture(id, SERVICE_PRICES.deregistration)
      return capture(id, amount)
    })

    await cancelApplication(flow.deps, (await flow.deps.repository.getStatusToken(reference))!)

    const paid = await flow.payment(reference)
    expect(paid.captured.subtract(paid.refunded)).toEqual(PROCESSING_FEE)
    expect((await flow.stored(reference)).status).toBe("cancelled")
    expect(flow.deps.mailer.sent.at(-1)?.template).toMatchObject({ amount: SERVICE_PRICES.deregistration.subtract(PROCESSING_FEE) })
  })

  it("retries a failed completion within minutes even when the authority works by hand", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    try {
      const flow = setupFlow()
      flow.deps.registration.setAuthorities(FAKE_REQUEST.licencePlate.prefix, [{ kreiscode: "00000", ikfzStatus: "unavailable" }])
      const reference = await flow.checkoutAndPay()
      const id = await flow.zulexId(reference)
      flow.deps.registration.setDocument("77", new TextEncoder().encode("%PDF-test"))
      flow.deps.registration.setStatus(id, { state: "finished", documents: [{ id: "77", kind: "confirmation" }] })
      jest.spyOn(flow.deps.mailer, "send").mockRejectedValueOnce(new Error("Mail unavailable"))

      expect(await flow.poll(6 * 60)).toEqual({ checked: 1, failed: 1 })
      expect(await flow.poll(2)).toEqual({ checked: 1, failed: 0 })
      expect((await flow.stored(reference)).status).toBe("completed")
    } finally {
      error.mockRestore()
    }
  })

  it("backs off when giving up on a submission the service never confirmed fails on the mailer", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const flow = setupFlow()
      flow.deps.registration.failNext("submit", new GatewayUnavailable())
      const reference = await flow.checkoutAndPay()
      await keepServiceDown(flow, 22)
      jest.spyOn(flow.deps.mailer, "send").mockRejectedValue(new Error("Mail unavailable"))

      for (let hour = 0; hour < 4; hour++) {
        flow.deps.registration.failNext("submit", new GatewayUnavailable())
        await flow.poll(60)
        expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })
      }
      expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
    } finally {
      error.mockRestore()
      warn.mockRestore()
    }
  })

  it.each(["document", "email"])("backs off after a completion %s failure, then resumes", async (failure) => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    try {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPay()
      const id = await flow.zulexId(reference)
      flow.deps.registration.setDocument("77", new TextEncoder().encode("%PDF-test"))
      flow.deps.registration.setStatus(id, { state: "finished", documents: [{ id: "77", kind: "confirmation" }] })
      if (failure === "document") jest.spyOn(flow.deps.documents, "put").mockRejectedValueOnce(new Error("Storage unavailable"))
      else jest.spyOn(flow.deps.mailer, "send").mockRejectedValueOnce(new Error("Mail unavailable"))

      expect(await flow.poll(1)).toEqual({ checked: 1, failed: 1 })
      expect((await flow.stored(reference)).polling.nextPollAt!.getTime()).toBeGreaterThan(flow.clock.now().getTime())
      expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })
      expect(await flow.poll(2)).toEqual({ checked: 1, failed: 0 })
      expect((await flow.stored(reference)).status).toBe("completed")
      expect(flow.emails().filter((name) => name === "completed")).toHaveLength(1)
    } finally {
      error.mockRestore()
    }
  })
})
