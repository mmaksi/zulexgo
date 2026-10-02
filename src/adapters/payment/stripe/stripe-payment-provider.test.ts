import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { anApplication } from "@/tests/fixtures/applications"
import { STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET, StripeDouble } from "@/tests/msw/stripe"
import { Money } from "@/src/core/domain/money"
import { HoldExpired } from "@/src/core/errors/hold-expired"
import { NotificationRejected } from "@/src/core/errors/notification-rejected"
import { paymentProviderContract } from "@/src/core/ports/payment-provider.contract"
import { StripePaymentProvider } from "./stripe-payment-provider"

let stripe = new StripeDouble()
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  stripe = new StripeDouble()
  server.resetHandlers(...stripe.handlers)
})
afterAll(() => server.close())

const provider = () => new StripePaymentProvider({ secretKey: STRIPE_TEST_SECRET_KEY, webhookSecret: STRIPE_TEST_WEBHOOK_SECRET })

paymentProviderContract("StripePaymentProvider", () => ({
  provider: provider(),
  customerPays: async (id, method) => stripe.customerPays(id, method),
  notificationOfPayment: async (id) => stripe.event("payment_intent.amount_capturable_updated", id),
}))

const TOTAL = Money.ofCents(6999)

async function newPayment() {
  const { reference, email } = anApplication()
  const created = await provider().createPayment({ reference, amount: TOTAL, email })
  return { reference, email, ...created, intent: () => stripe.intents.get(created.paymentId)! }
}

describe("StripePaymentProvider", () => {
  it.each(["invalid_request_error", "idempotency_error"])("reports a concurrent capture when Stripe responds with %s", async (type) => {
    const { paymentId } = await newPayment()
    stripe.customerPays(paymentId, "card")
    server.use(http.post(`https://api.stripe.com/v1/payment_intents/${paymentId}/capture`, () => {
      stripe.customerPays(paymentId, "sepaDebit")
      return HttpResponse.json({ error: { type, code: "payment_intent_unexpected_state", message: "Already captured" } }, { status: 400 })
    }))

    expect(await provider().capture(paymentId, TOTAL)).toMatchObject({ status: "captured", captured: TOTAL })
  })

  it.each(["charge_expired_for_capture", "capture_charge_authorization_expired"])(
    "reports an expired hold when Stripe refuses the capture with %s before the intent shows it",
    async (code) => {
      const { paymentId } = await newPayment()
      stripe.customerPays(paymentId, "card")
      server.use(http.post(`https://api.stripe.com/v1/payment_intents/${paymentId}/capture`, () =>
        HttpResponse.json({ error: { type: "invalid_request_error", code, message: "The authorization has expired" } }, { status: 400 }),
      ))

      await expect(provider().capture(paymentId, TOTAL)).rejects.toBeInstanceOf(HoldExpired)
    },
  )

  it("preserves a provider validation error when the hold is still available", async () => {
    const { paymentId } = await newPayment()
    stripe.customerPays(paymentId, "card")
    server.use(http.post(`https://api.stripe.com/v1/payment_intents/${paymentId}/capture`, () =>
      HttpResponse.json({ error: { type: "invalid_request_error", code: "parameter_invalid_integer", message: "Invalid amount" } }, { status: 400 }),
    ))

    await expect(provider().capture(paymentId, TOTAL)).rejects.toMatchObject({ type: "StripeInvalidRequestError", code: "parameter_invalid_integer" })
  })

  it("opens a card-only PaymentIntent that is held, not taken, tagged with the order and nothing personal", async () => {
    const { reference, email, intent } = await newPayment()

    expect(intent()).toMatchObject({
      amount: 6999,
      capture_method: "manual",
      payment_method_types: ["card"],
      metadata: { order_id: reference, service_type: "deregistration" },
    })
    expect(stripe.sent.join("\n")).not.toContain(encodeURIComponent(email))
    expect(stripe.sent.join("\n")).not.toContain("customer")
  })

  it("reports when a held card must be captured by", async () => {
    const { paymentId } = await newPayment()
    stripe.customerPays(paymentId, "card")

    const payment = await provider().getPayment(paymentId)

    expect(payment.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000)
  })

  it("keeps the refund total across a partial capture and later refunds", async () => {
    const { paymentId } = await newPayment()
    stripe.customerPays(paymentId, "sepaDebit")

    await provider().refund(paymentId, Money.ofCents(5000), "refund-1")

    expect(await provider().getPayment(paymentId)).toMatchObject({ captured: TOTAL, refunded: Money.ofCents(5000) })
  })

  it("refunds once per idempotency key even when the retry comes from a new process", async () => {
    const { paymentId } = await newPayment()
    stripe.customerPays(paymentId, "sepaDebit")

    await provider().refund(paymentId, Money.ofCents(5000), "refund-1")
    const again = await provider().refund(paymentId, Money.ofCents(5000), "refund-1")

    expect(again.refunded).toEqual(Money.ofCents(5000))
  })

  describe("notifications", () => {
    it("ignores unrelated metadata that is not a valid order reference", async () => {
      const { paymentId } = await newPayment()
      stripe.intents.get(paymentId)!.metadata = { order_id: "another-app-order" }
      const { payload, signature } = stripe.event("payment_intent.succeeded", paymentId)

      expect(provider().readNotification(payload, signature)).toMatchObject({ kind: "ignored" })
    })

    it.each(["payment_intent.amount_capturable_updated", "payment_intent.succeeded"])(
      "starts the application on %s",
      async (type) => {
        const { paymentId, reference } = await newPayment()
        stripe.customerPays(paymentId, "card")
        const { payload, signature } = stripe.event(type, paymentId)

        expect(provider().readNotification(payload, signature)).toMatchObject({ kind: "paymentReady", reference })
      },
    )

    it.each(["payment_intent.payment_failed", "payment_intent.created", "charge.refunded"])("ignores %s", async (type) => {
      const { paymentId } = await newPayment()
      const { payload, signature } = stripe.event(type, paymentId)

      expect(provider().readNotification(payload, signature)).toMatchObject({ kind: "ignored" })
    })

    it("ignores a PaymentIntent that is not one of our orders", async () => {
      const { paymentId } = await newPayment()
      stripe.intents.get(paymentId)!.metadata = {}
      const { payload, signature } = stripe.event("payment_intent.succeeded", paymentId)

      expect(provider().readNotification(payload, signature)).toMatchObject({ kind: "ignored" })
    })

    it("rejects an event signed with another endpoint's secret", async () => {
      const { paymentId } = await newPayment()
      const { payload, signature } = stripe.event("payment_intent.succeeded", paymentId, "whsec_someone_else")

      expect(() => provider().readNotification(payload, signature)).toThrow(NotificationRejected)
    })
  })
})
