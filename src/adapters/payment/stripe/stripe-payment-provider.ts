import Stripe from "stripe"
import type { Money } from "@/src/core/domain/money"
import { HoldExpired } from "@/src/core/errors/hold-expired"
import { NotificationRejected } from "@/src/core/errors/notification-rejected"
import type { Payment, PaymentNotification, PaymentProvider } from "@/src/core/ports/payment-provider"
import { toNotification, toPayment } from "./map"

/** Stripe's API version this adapter's mapping was written against; pinned so an account upgrade changes nothing here. */
const API_VERSION = "2026-08-26.dahlia"

/**
 * `PaymentProvider` on Stripe PaymentIntents. Cards only (Apple Pay and Google
 * Pay are cards), held by manual capture. Nothing personal goes to Stripe from
 * here: no Customer object, no email; the order reference is the only link.
 */
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe

  constructor(private readonly config: { secretKey: string; webhookSecret: string }) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: API_VERSION,
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
    })
  }

  async createPayment({ reference, amount }: Parameters<PaymentProvider["createPayment"]>[0]) {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: amount.cents,
        currency: "eur",
        payment_method_types: ["card"],
        capture_method: "manual",
        metadata: { order_id: reference, service_type: "deregistration" },
      },
      { idempotencyKey: `payment/${reference}` },
    )
    return { paymentId: intent.id, clientSecret: intent.client_secret! }
  }

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
      // The hold lapsed between reading and capturing.
      if (error instanceof Stripe.errors.StripeInvalidRequestError) throw new HoldExpired(paymentId)
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

  /**
   * Stripe forgets an idempotency key after 24 hours, so the key is also kept
   * on the refund itself: a rerun days later still finds it and refunds nothing.
   */
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

  /** Business logic §4's `application_id`, added to the order metadata once the registration service accepts the application. */
  async recordRegistration(paymentId: string, registrationId: string): Promise<void> {
    await this.stripe.paymentIntents.update(
      paymentId,
      { metadata: { application_id: registrationId } },
      { idempotencyKey: `registration/${paymentId}/${registrationId}` },
    )
  }

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
