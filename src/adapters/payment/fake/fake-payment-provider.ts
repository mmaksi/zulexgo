import type { ApplicationReference } from "@/src/core/domain/application-reference"
import { Money } from "@/src/core/domain/money"
import { HoldExpired } from "@/src/core/errors/hold-expired"
import type { Clock } from "@/src/core/ports/clock"
import type { Payment, PaymentMethodKind, PaymentProvider } from "@/src/core/ports/payment-provider"

/** Stripe's validity for an online card authorisation (verified via the Stripe docs MCP, 2026-09-27). */
const HOLD_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000
const NOTHING = Money.ofCents(0)

type Stored = { -readonly [Key in keyof Payment]: Payment[Key] } & { reference: ApplicationReference }

/** In-memory payments; `customerPays` stands in for the customer confirming in the browser. */
export class FakePaymentProvider implements PaymentProvider {
  private readonly payments = new Map<string, Stored>()
  private readonly refundKeys = new Set<string>()

  constructor(private readonly clock: Clock) {}

  async createPayment({ reference, amount }: Parameters<PaymentProvider["createPayment"]>[0]) {
    const existing = [...this.payments.values()].find((payment) => payment.reference === reference)
    const payment = existing ?? this.store(reference, amount)
    return { paymentId: payment.id, clientSecret: `${payment.id}_secret` }
  }

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

  private snapshot({ id, status, amount, captured, refunded, holdExpiresAt }: Stored): Payment {
    return { id, status, amount, captured, refunded, holdExpiresAt }
  }
}
