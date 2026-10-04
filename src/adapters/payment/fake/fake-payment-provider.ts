import { createHmac, timingSafeEqual } from "node:crypto"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { CARD_HOLD_LIFETIME_MS } from "@/src/core/domain/payment/hold-policy"
import { Money } from "@/src/core/domain/payment/money"
import { HoldExpired } from "@/src/core/errors/payment/hold-expired"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Clock } from "@/src/core/ports/clock/clock"
import type { Payment, PaymentMethodKind, PaymentNotification, PaymentProvider } from "@/src/core/ports/payment/payment-provider"

const HOLD_VALIDITY_MS = CARD_HOLD_LIFETIME_MS
const NOTHING = Money.ofCents(0)
/**
 * Public on purpose: it signs the fake's notifications (standing in for Stripe's webhook
 * signature), so a valid signature proves only that the payload came from the fake.
 */
const SIGNING_SECRET = "fake-payment-notification-secret"

const sign = (payload: string) => createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex")

/** A payment as the fake keeps it: mutable, tagged with the reference `createPayment` keys on. */
type Stored = { -readonly [Key in keyof Payment]: Payment[Key] } & { reference: ApplicationReference }

/**
 * A payment that already exists when the provider starts, as dev's seeded orders have.
 * It has no hold expiry or registration id of its own: a seeded hold gets a fresh expiry.
 */
export type ExistingPayment = Pick<Payment, "id" | "status" | "amount" | "captured" | "refunded"> & { reference: ApplicationReference }

/**
 * In-memory `PaymentProvider`; `customerPays` stands in for the customer confirming in the browser.
 * Selected by `PAYMENT_DRIVER=fake`, the default (the env check refuses it in production),
 * and used by tests; it passes the same contract suite as `StripePaymentProvider`.
 *
 * It simulates what the port promises: one payment per reference, a card hold that lapses
 * after seven days against the injected `Clock`, partial capture, and refunds that apply once
 * per idempotency key. It does not simulate declines, abandoned payments, SEPA's days of
 * processing (SEPA Direct Debit is captured the moment `customerPays` runs), Stripe's
 * refusal of a reused idempotency key with changed parameters, or network failures.
 * Notifications are signed with a fixed public secret, which is enough to test rejection
 * of an unsigned or altered payload and worthless as security.
 */
export class FakePaymentProvider implements PaymentProvider {
  private readonly payments = new Map<string, Stored>()
  private readonly refundKeys = new Set<string>()

  /** `existing` seeds payments for seeded orders; a seeded hold lapses seven days after start. */
  constructor(
    private readonly clock: Clock,
    existing: readonly ExistingPayment[] = [],
  ) {
    for (const payment of existing) {
      const holdExpiresAt = payment.status === "held" ? new Date(clock.now().getTime() + HOLD_VALIDITY_MS) : undefined
      this.payments.set(payment.id, { ...payment, holdExpiresAt })
    }
  }

  /**
   * A reference already used returns its first payment, whatever amount the repeat asks for.
   * The client secret is made up: there is no browser SDK to consume it.
   */
  async createPayment({ reference, amount }: Parameters<PaymentProvider["createPayment"]>[0]) {
    const existing = [...this.payments.values()].find((payment) => payment.reference === reference)
    const payment = existing ?? this.store(reference, amount)
    return { paymentId: payment.id, clientSecret: `${payment.id}_secret` }
  }

  /**
   * Test and dev hook, not part of the port (the container's `simulateCustomerPayment` pays by
   * card through it). A card becomes `held` with a fresh seven-day expiry; SEPA Direct Debit
   * cannot be held, so it is `captured` in full at once. It does not check the payment is still
   * awaiting the customer, so calling it on a settled payment overwrites that state.
   */
  async customerPays(paymentId: string, method: PaymentMethodKind): Promise<void> {
    const payment = this.find(paymentId)
    if (method === "sepaDebit") {
      Object.assign(payment, { status: "captured", captured: payment.amount })
      return
    }
    Object.assign(payment, {
      status: "held",
      holdExpiresAt: new Date(this.clock.now().getTime() + HOLD_VALIDITY_MS),
    })
  }

  /**
   * What the provider would send once the customer has paid: a signed `paymentReady` event for
   * the payment's order, in the shape `readNotification` accepts. The event id is fixed per
   * payment, so calling it again reproduces a provider that delivers the same event twice.
   */
  notificationOfPayment(paymentId: string): { payload: string; signature: string } {
    const { reference } = this.find(paymentId)
    const payload = JSON.stringify({ id: `fake-event-${paymentId}`, type: "paymentReady", reference })
    return { payload, signature: sign(payload) }
  }

  /**
   * Accepts only a payload signed with the fake's secret, compared in constant time; a
   * missing or wrong signature is `NotificationRejected`. A `paymentReady` event starts the
   * application and any other type is ignored. It does not check that the payment exists.
   */
  readNotification(payload: string, signature: string | null): PaymentNotification {
    const expected = Buffer.from(sign(payload))
    const given = Buffer.from(signature ?? "")
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new NotificationRejected()

    const { id, type, reference } = JSON.parse(payload)
    return type === "paymentReady" ? { kind: "paymentReady", eventId: id, reference } : { kind: "ignored", eventId: id }
  }

  async getPayment(paymentId: string): Promise<Payment> {
    return this.snapshot(this.find(paymentId))
  }

  /**
   * Anything not held, whether never paid, released or lapsed, throws `HoldExpired`; a captured
   * payment is returned as it is. Capturing less than the hold takes only that amount; the
   * remainder is not tracked, since Stripe releases it.
   */
  async capture(paymentId: string, amount: Money): Promise<Payment> {
    const payment = this.find(paymentId)
    if (payment.status === "captured") return this.snapshot(payment)
    if (payment.status !== "held") throw new HoldExpired(paymentId)
    if (amount.isGreaterThan(payment.amount)) throw new RangeError("Cannot capture more than was held")

    Object.assign(payment, { status: "captured", captured: amount, holdExpiresAt: undefined })
    return this.snapshot(payment)
  }

  /**
   * Also releases a payment never paid, as cancelling an unpaid PaymentIntent does; captured
   * money throws `RangeError`.
   */
  async release(paymentId: string): Promise<Payment> {
    const payment = this.find(paymentId)
    if (payment.status === "captured") throw new RangeError("A captured payment is refunded, not released")

    Object.assign(payment, { status: "released", holdExpiresAt: undefined })
    return this.snapshot(payment)
  }

  /**
   * A key already used returns the payment untouched, before any check of state or amount, so
   * a replay is a no-op even after the whole amount went back. Keys are remembered for the life
   * of the instance; Stripe forgets them after 24 hours, which `StripePaymentProvider` handles.
   */
  async refund(paymentId: string, amount: Money, idempotencyKey: string): Promise<Payment> {
    const payment = this.find(paymentId)
    if (this.refundKeys.has(idempotencyKey)) return this.snapshot(payment)
    if (payment.status !== "captured") throw new RangeError("Only captured money can be refunded")
    if (amount.isGreaterThan(payment.captured.subtract(payment.refunded))) {
      throw new RangeError("Cannot refund more than was captured and not yet refunded")
    }

    this.refundKeys.add(idempotencyKey)
    payment.refunded = payment.refunded.add(amount)
    return this.snapshot(payment)
  }

  async recordRegistration(paymentId: string, registrationId: string): Promise<void> {
    this.find(paymentId).registrationId = registrationId
  }

  /** Ids are numbered per instance, counting seeded payments. */
  private store(reference: ApplicationReference, amount: Money): Stored {
    const id = `fake-payment-${this.payments.size + 1}`
    const payment: Stored = { id, reference, status: "awaitingCustomer", amount, captured: NOTHING, refunded: NOTHING }
    this.payments.set(id, payment)
    return payment
  }

  /**
   * Every lookup lets a lapsed hold expire first, so all reads see the injected clock's time.
   * An unknown id throws a plain `Error`.
   */
  private find(paymentId: string): Stored {
    const payment = this.payments.get(paymentId)
    if (!payment) throw new Error(`FakePaymentProvider: unknown payment ${paymentId}`)
    this.expireIfDue(payment)
    return payment
  }

  /**
   * A hold past its expiry becomes `released`, as Stripe cancels a lapsed authorisation.
   * Nothing was taken, so nothing is refunded.
   */
  private expireIfDue(payment: Stored): void {
    if (payment.status === "held" && payment.holdExpiresAt! <= this.clock.now()) {
      Object.assign(payment, { status: "released", holdExpiresAt: undefined })
    }
  }

  /** A copy in the port's `Payment` shape, so a caller never holds the mutable stored record. */
  private snapshot({ id, status, amount, captured, refunded, holdExpiresAt, registrationId }: Stored): Payment {
    return { id, status, amount, captured, refunded, holdExpiresAt, registrationId }
  }
}
