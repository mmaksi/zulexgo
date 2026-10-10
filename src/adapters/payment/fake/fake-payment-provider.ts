import { createHmac, timingSafeEqual } from "node:crypto"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { CARD_HOLD_LIFETIME_MS } from "@/src/core/domain/payment/hold-policy"
import { Money } from "@/src/core/domain/payment/money"
import { HoldExpired } from "@/src/core/errors/payment/hold-expired"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Clock } from "@/src/core/ports/clock/clock"
import type { Payment, PaymentNotification, PaymentProvider } from "@/src/core/ports/payment/payment-provider"

const HOLD_VALIDITY_MS = CARD_HOLD_LIFETIME_MS
const NOTHING = Money.ofCents(0)
const SIGNING_SECRET = "fake-payment-notification-secret"

const sign = (payload: string) => createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex")

type Stored = { -readonly [Key in keyof Payment]: Payment[Key] } & { reference: ApplicationReference }

export type ExistingPayment = Pick<Payment, "id" | "status" | "amount" | "captured" | "refunded"> & { reference: ApplicationReference }

export class FakePaymentProvider implements PaymentProvider {
  private readonly payments = new Map<string, Stored>()
  private readonly refundKeys = new Set<string>()

  constructor(
    private readonly clock: Clock,
    existing: readonly ExistingPayment[] = [],
  ) {
    for (const payment of existing) {
      const holdExpiresAt = payment.status === "held" ? new Date(clock.now().getTime() + HOLD_VALIDITY_MS) : undefined
      this.payments.set(payment.id, { ...payment, holdExpiresAt })
    }
  }

  async createPayment({ reference, amount }: Parameters<PaymentProvider["createPayment"]>[0]) {
    const existing = [...this.payments.values()].find((payment) => payment.reference === reference)
    const payment = existing ?? this.store(reference, amount)
    return { paymentId: payment.id, clientSecret: `${payment.id}_secret` }
  }

  async customerPays(paymentId: string): Promise<void> {
    const payment = this.find(paymentId)
    Object.assign(payment, {
      status: "held",
      holdExpiresAt: new Date(this.clock.now().getTime() + HOLD_VALIDITY_MS),
    })
  }

  notificationOfPayment(paymentId: string): { payload: string; signature: string } {
    const { reference } = this.find(paymentId)
    const payload = JSON.stringify({ id: `fake-event-${paymentId}`, type: "paymentReady", reference })
    return { payload, signature: sign(payload) }
  }

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

  async capture(paymentId: string, amount: Money): Promise<Payment> {
    const payment = this.find(paymentId)
    if (payment.status === "captured") return this.snapshot(payment)
    if (payment.status !== "held") throw new HoldExpired(paymentId)
    if (amount.isGreaterThan(payment.amount)) throw new RangeError("Cannot capture more than was held")

    Object.assign(payment, { status: "captured", captured: amount, holdExpiresAt: undefined })
    return this.snapshot(payment)
  }

  async release(paymentId: string): Promise<Payment> {
    const payment = this.find(paymentId)
    if (payment.status === "captured") throw new RangeError("A captured payment is refunded, not released")

    Object.assign(payment, { status: "released", holdExpiresAt: undefined })
    return this.snapshot(payment)
  }

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

  private store(reference: ApplicationReference, amount: Money): Stored {
    const id = `fake-payment-${this.payments.size + 1}`
    const payment: Stored = { id, reference, status: "awaitingCustomer", amount, captured: NOTHING, refunded: NOTHING }
    this.payments.set(id, payment)
    return payment
  }

  private find(paymentId: string): Stored {
    const payment = this.payments.get(paymentId)
    if (!payment) throw new Error(`FakePaymentProvider: unknown payment ${paymentId}`)
    this.expireIfDue(payment)
    return payment
  }

  private expireIfDue(payment: Stored): void {
    if (payment.status === "held" && payment.holdExpiresAt! <= this.clock.now()) {
      Object.assign(payment, { status: "released", holdExpiresAt: undefined })
    }
  }

  private snapshot({ id, status, amount, captured, refunded, holdExpiresAt, registrationId }: Stored): Payment {
    return { id, status, amount, captured, refunded, holdExpiresAt, registrationId }
  }
}
