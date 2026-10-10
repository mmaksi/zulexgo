import Stripe from "stripe"
import type { Money } from "@/src/core/domain/payment/money"
import { HoldExpired } from "@/src/core/errors/payment/hold-expired"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Payment, PaymentNotification, PaymentProvider } from "@/src/core/ports/payment/payment-provider"
import { toNotification, toPayment } from "./map"

// Pinned: an unpinned client follows the account's API version, which an upgrade changes.
const API_VERSION = "2026-08-26.dahlia"

// Stripe's codes for capturing a lapsed authorisation, sent before the intent shows it lapsed.
const EXPIRED_AUTHORISATION = new Set(["charge_expired_for_capture", "capture_charge_authorization_expired"])

// Privacy: nothing personal goes to Stripe (no Customer, no email); the order reference is the only link.
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe

  constructor(private readonly config: { secretKey: string; webhookSecret: string }) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: API_VERSION,
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
    })
  }

  async createPayment({ reference, service, amount }: Parameters<PaymentProvider["createPayment"]>[0]) {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: amount.cents,
        currency: "eur",
        payment_method_types: ["card"],
        capture_method: "manual",
        metadata: { order_id: reference, service_type: service },
      },
      { idempotencyKey: `payment/${reference}` },
    )
    return { paymentId: intent.id, clientSecret: intent.client_secret! }
  }

  // Hold expiry and refunded amount live only on the charge, hence the expand.
  async getPayment(paymentId: string): Promise<Payment> {
    return toPayment(await this.stripe.paymentIntents.retrieve(paymentId, { expand: ["latest_charge"] }))
  }

  async capture(paymentId: string, amount: Money): Promise<Payment> {
    const payment = await this.getPayment(paymentId)
    if (payment.status === "captured") return payment
    if (payment.status !== "held") throw new HoldExpired(paymentId)
    if (amount.isGreaterThan(payment.amount)) throw new RangeError("Cannot capture more than was held")

    try {
      await this.stripe.paymentIntents.capture(paymentId, { amount_to_capture: amount.cents }, { idempotencyKey: `capture/${paymentId}` })
    } catch (error) {
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code && EXPIRED_AUTHORISATION.has(error.code)) throw new HoldExpired(paymentId)
      // Other refusals, or a key reused with another amount, may mean a capture won since our read.
      if (error instanceof Stripe.errors.StripeInvalidRequestError || error instanceof Stripe.errors.StripeIdempotencyError) {
        const current = await this.getPayment(paymentId)
        if (current.status === "captured") return current
        if (current.status === "released") throw new HoldExpired(paymentId)
      }
      throw error
    }
    return this.getPayment(paymentId)
  }

  async release(paymentId: string): Promise<Payment> {
    const payment = await this.getPayment(paymentId)
    if (payment.status === "captured") throw new RangeError("A captured payment is refunded, not released")
    if (payment.status === "released") return payment

    await this.stripe.paymentIntents.cancel(paymentId, {}, { idempotencyKey: `release/${paymentId}` })
    return this.getPayment(paymentId)
  }

  // Stripe forgets an idempotency key after 24 hours, so the key also lives on the refund's metadata.
  async refund(paymentId: string, amount: Money, idempotencyKey: string): Promise<Payment> {
    const earlier = await this.stripe.refunds.list({ payment_intent: paymentId, limit: 100 })
    if (earlier.data.some((refund) => refund.metadata?.idempotency_key === idempotencyKey)) return this.getPayment(paymentId)

    const payment = await this.getPayment(paymentId)
    if (payment.status !== "captured") throw new RangeError("Only captured money can be refunded")
    if (amount.isGreaterThan(payment.captured.subtract(payment.refunded))) {
      throw new RangeError("Cannot refund more than was captured and not yet refunded")
    }

    await this.stripe.refunds.create(
      { payment_intent: paymentId, amount: amount.cents, metadata: { idempotency_key: idempotencyKey } },
      { idempotencyKey: `refund/${idempotencyKey}` },
    )
    return this.getPayment(paymentId)
  }

  async recordRegistration(paymentId: string, registrationId: string): Promise<void> {
    await this.stripe.paymentIntents.update(
      paymentId,
      { metadata: { application_id: registrationId } },
      { idempotencyKey: `registration/${paymentId}/${registrationId}` },
    )
  }

  // payload must be the raw body as Stripe sent it: re-serialised JSON fails the signature check.
  readNotification(payload: string, signature: string | null): PaymentNotification {
    if (!signature) throw new NotificationRejected()
    let event: Stripe.Event
    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, this.config.webhookSecret)
    } catch {
      throw new NotificationRejected()
    }
    return toNotification(event)
  }
}
