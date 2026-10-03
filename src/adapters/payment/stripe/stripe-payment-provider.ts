import Stripe from "stripe"
import type { Money } from "@/src/core/domain/payment/money"
import { HoldExpired } from "@/src/core/errors/payment/hold-expired"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Payment, PaymentNotification, PaymentProvider } from "@/src/core/ports/payment/payment-provider"
import { toNotification, toPayment } from "./map"

/** Stripe's API version this adapter's mapping was written against; pinned so an account upgrade changes nothing here. */
const API_VERSION = "2026-08-26.dahlia"

/** Stripe's answers to capturing an authorisation that has lapsed, which the intent may not show yet. */
const EXPIRED_AUTHORISATION = new Set(["charge_expired_for_capture", "capture_charge_authorization_expired"])

/**
 * `PaymentProvider` on Stripe PaymentIntents. Cards only (Apple Pay and Google
 * Pay are cards), held by manual capture. Nothing personal goes to Stripe from
 * here: no Customer object, no email; the order reference is the only link.
 *
 * Selected by `PAYMENT_DRIVER=stripe`: test mode in dev, the staging sandbox on staging, the
 * live account in production; the env check refuses a live key outside production and a test
 * key in production. Amounts are euro cents.
 *
 * Every write carries an idempotency key made of our own ids (`payment/<reference>`,
 * `capture/<paymentId>`, …), and the SDK's network retries repeat a request that failed in
 * transit under that same key, so a retry never charges, captures or refunds twice. Stripe
 * forgets a key after 24 hours, which `refund` guards against separately.
 *
 * Only two Stripe failures become domain errors: a capture of a lapsed authorisation is
 * `HoldExpired` (`capture` tells it from other invalid requests), and a webhook that fails
 * verification is `NotificationRejected`. Any other Stripe error (a validation error, a
 * network failure, an authentication error, a 5xx) reaches the caller as the SDK's own.
 * Status, amounts and hold expiry are read through `./map`.
 */
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe

  /** `webhookSecret` is the signing secret of this stage's webhook, used by `readNotification`. */
  constructor(private readonly config: { secretKey: string; webhookSecret: string }) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: API_VERSION,
      httpClient: Stripe.createFetchHttpClient(),
      maxNetworkRetries: 2,
    })
  }

  /**
   * Opens a card PaymentIntent with manual capture, so the customer's confirmation holds the
   * money rather than taking it. The metadata carries `order_id`, which `readNotification`
   * uses to tell our orders from other intents on the account. Idempotent on the reference,
   * within Stripe's 24-hour window. `email` from the port is deliberately not sent.
   */
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

  /** Expands `latest_charge`: the hold's expiry and the refunded amount are only on the charge. */
  async getPayment(paymentId: string): Promise<Payment> {
    return toPayment(await this.stripe.paymentIntents.retrieve(paymentId, { expand: ["latest_charge"] }))
  }

  /**
   * Reads the payment first, so an already captured one is returned unchanged and any payment
   * that is not held, never paid included, throws `HoldExpired` without calling Stripe to
   * capture. Capturing less than the hold (`amount_to_capture`) makes Stripe release the rest.
   *
   * When Stripe refuses the capture the payment is read again: a capture that won in the
   * meantime is returned (its amount may differ from the one asked), a released or expired
   * authorisation is `HoldExpired`, and any other refusal is thrown as Stripe sent it.
   */
  async capture(paymentId: string, amount: Money): Promise<Payment> {
    const payment = await this.getPayment(paymentId)
    if (payment.status === "captured") return payment
    if (payment.status !== "held") throw new HoldExpired(paymentId)
    if (amount.isGreaterThan(payment.amount)) throw new RangeError("Cannot capture more than was held")

    try {
      await this.stripe.paymentIntents.capture(paymentId, { amount_to_capture: amount.cents }, { idempotencyKey: `capture/${paymentId}` })
    } catch (error) {
      // Stripe's own "authorisation expired" answers say so even before the intent shows it.
      if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code && EXPIRED_AUTHORISATION.has(error.code)) throw new HoldExpired(paymentId)
      // Any other invalid request (and an idempotency clash, which a different amount under the same key causes) is
      // not necessarily an expired hold: it may be a validation error, or a capture that won since our read.
      if (error instanceof Stripe.errors.StripeInvalidRequestError || error instanceof Stripe.errors.StripeIdempotencyError) {
        // Only an actually released authorisation is expired; validation errors stay visible.
        const current = await this.getPayment(paymentId)
        if (current.status === "captured") return current
        if (current.status === "released") throw new HoldExpired(paymentId)
      }
      throw error
    }
    return this.getPayment(paymentId)
  }

  /**
   * Cancels the PaymentIntent, which is how Stripe lets go of a hold; that also closes one the
   * customer never paid. Releasing a released payment returns it without a second cancel.
   * Captured money is refunded, not released, so that throws `RangeError`.
   */
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
   * The lookup reads at most the 100 latest refunds of the intent and runs before any state
   * check, so a replay is a no-op even once the whole amount has been returned.
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

  /**
   * Business logic §4's `application_id`, added to the order metadata once the registration
   * service accepts the application.
   * Stripe merges metadata by key, so `order_id` and `service_type` stay as createPayment set them.
   */
  async recordRegistration(paymentId: string, registrationId: string): Promise<void> {
    await this.stripe.paymentIntents.update(
      paymentId,
      { metadata: { application_id: registrationId } },
      { idempotencyKey: `registration/${paymentId}/${registrationId}` },
    )
  }

  /**
   * `payload` must be the raw request body exactly as Stripe sent it and `signature` the
   * `Stripe-Signature` header: re-serialised JSON fails the check. Stripe's verification also
   * rejects a timestamp older than five minutes. Which events start an application, and which
   * are ignored, is decided in `./map`.
   */
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
