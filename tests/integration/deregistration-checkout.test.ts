import { handlePaymentNotification } from "@/app/api/webhooks/stripe/handle"
import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { submitCheckout } from "@/src/core/use-cases/submit-checkout"
import { webhookRequest, withVendorsAtTheNetwork } from "./network-harness"

/**
 * M4: checkout → Stripe holds the card → signed webhook → status 1, email 1 →
 * filed with Zulex → status 4. Real Stripe and Zulex adapters, both vendors
 * stubbed at the network. Identity verification is not in the flow yet.
 */
const { world, stored, emails } = withVendorsAtTheNetwork()

/** PaymentIntent, PaymentMethod, Charge, Customer, Refund, Payment, Source, Card, SetupIntent, Event. */
const STRIPE_OBJECT_ID = /\b(?:pi|pm|ch|cus|re|py|src|card|seti|evt)_[A-Za-z0-9]+/g

async function checkout() {
  const { reference, clientSecret } = await submitCheckout(world.deps, { request: FAKE_REQUEST, email: "customer@example.test" })
  const paymentId = (await stored(reference)).payment.id
  return { reference, clientSecret, paymentId }
}

describe("de-registration checkout", () => {
  it("starts the application from Stripe's signed webhook once the card is held, and files it with Zulex", async () => {
    const { reference, paymentId } = await checkout()
    world.stripe.customerPays(paymentId, "card")

    const response = await handlePaymentNotification(
      world.deps,
      webhookRequest(world.stripe.event("payment_intent.amount_capturable_updated", paymentId)),
    )

    expect(response.status).toBe(200)
    const application = await stored(reference)
    expect(application.status).toBe("submitted_to_kba")
    expect(world.zulex.applications.has(application.zulexApplicationId!)).toBe(true)
    expect(world.stripe.intents.get(paymentId)).toMatchObject({
      status: "requires_capture",
      metadata: { order_id: reference, service_type: "deregistration" },
    })
    expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
    expect(await world.deps.repository.getStatusToken(reference)).toEqual(expect.any(String))
  })

  it("keeps the PaymentIntent id and nothing else of Stripe's in the application record", async () => {
    const { reference, clientSecret, paymentId } = await checkout()
    world.stripe.customerPays(paymentId, "card")

    await handlePaymentNotification(world.deps, webhookRequest(world.stripe.event("payment_intent.amount_capturable_updated", paymentId)))

    const record = JSON.stringify(await stored(reference))
    expect(record.match(STRIPE_OBJECT_ID)).toEqual([paymentId])
    expect(record).not.toContain(clientSecret)
  })

  it("sends Zulex the vehicle the customer entered, with our idempotency key", async () => {
    const { reference, paymentId } = await checkout()
    world.stripe.customerPays(paymentId, "card")

    await handlePaymentNotification(world.deps, webhookRequest(world.stripe.event("payment_intent.amount_capturable_updated", paymentId)))

    const [filed] = world.zulex.requests.filter((request) => request.method === "POST")
    expect(filed.headers.get("X-Idempotency-Key")).toBe((await stored(reference)).idempotencyKey)
    expect(filed.body).toMatchObject({ vin: FAKE_REQUEST.vin, rearLicencePlateSecurityCode: FAKE_REQUEST.codes.rearPlate })
  })

  it("acts once on a webhook Stripe delivers twice", async () => {
    const { paymentId } = await checkout()
    world.stripe.customerPays(paymentId, "card")
    const event = world.stripe.event("payment_intent.amount_capturable_updated", paymentId)

    await handlePaymentNotification(world.deps, webhookRequest(event))
    await handlePaymentNotification(world.deps, webhookRequest(event))
    await handlePaymentNotification(world.deps, webhookRequest(world.stripe.event("payment_intent.succeeded", paymentId)))

    expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
    expect(world.zulex.applications.size).toBe(1)
  })

  it.each([
    ["unsigned", (event: { payload: string; signature: string }) => ({ payload: event.payload })],
    ["forged", (event: { payload: string; signature: string }) => ({ payload: event.payload.replace("requires_capture", "succeeded"), signature: event.signature })],
  ])("rejects an %s webhook and starts nothing", async (_, tamper) => {
    const { reference, paymentId } = await checkout()
    world.stripe.customerPays(paymentId, "card")

    const response = await handlePaymentNotification(
      world.deps,
      webhookRequest(tamper(world.stripe.event("payment_intent.amount_capturable_updated", paymentId))),
    )

    expect(response.status).toBe(400)
    expect((await stored(reference)).status).toBe("awaiting_payment")
    expect(emails()).toEqual([])
  })

  it("does not start an application whose payment was not completed", async () => {
    const { reference, paymentId } = await checkout()

    await handlePaymentNotification(world.deps, webhookRequest(world.stripe.event("payment_intent.payment_failed", paymentId)))

    expect((await stored(reference)).status).toBe("awaiting_payment")
  })
})
