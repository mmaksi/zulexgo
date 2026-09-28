import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { Email } from "@/src/core/domain/email"
import type { Money } from "@/src/core/domain/money"

export type PaymentMethodKind = "card" | "sepaDebit"

/**
 * `held`: a card authorised but not yet taken. `captured`: money taken, which
 * SEPA Direct Debit is at checkout. `released`: a hold let go, by us or by expiry.
 */
export type PaymentStatus = "awaitingCustomer" | "held" | "captured" | "released"

export interface Payment {
  readonly id: string
  readonly status: PaymentStatus
  readonly amount: Money
  readonly captured: Money
  readonly refunded: Money
  /** Only while held: after this the provider releases the hold (7 days for an online card payment). */
  readonly holdExpiresAt?: Date
}

/**
 * What a provider notification means for an application. `paymentReady`: the
 * money is held, or taken where it cannot be held, so the application may
 * start. Everything else is not acted on yet.
 */
export type PaymentNotification =
  | { readonly kind: "paymentReady"; readonly eventId: string; readonly reference: ApplicationReference }
  | { readonly kind: "ignored"; readonly eventId: string }

/**
 * Takes the customer's money. The customer confirms in the browser; the server
 * only creates, captures, releases and refunds.
 *
 * Guarantees every adapter must honour:
 * - `createPayment` for a reference already used returns the same payment, so
 *   a retried checkout never charges twice.
 * - `capture` happens once. Capturing less than the hold releases the rest; a
 *   second capture returns the payment unchanged. Capturing from a payment that
 *   is no longer held throws `HoldExpired`.
 * - `release` is safe to call twice.
 * - `refund` needs captured money and never exceeds captured minus refunded.
 *   The same idempotency key refunds once, however often it is sent.
 * - `readNotification` trusts only a payload signed by the provider; anything
 *   unsigned or altered throws `NotificationRejected`. The same notification
 *   may arrive twice, so acting on it must be safe to repeat.
 */
export interface PaymentProvider {
  createPayment(input: {
    reference: ApplicationReference
    amount: Money
    email: Email
  }): Promise<{ paymentId: string; clientSecret: string }>
  getPayment(paymentId: string): Promise<Payment>
  capture(paymentId: string, amount: Money): Promise<Payment>
  release(paymentId: string): Promise<Payment>
  refund(paymentId: string, amount: Money, idempotencyKey: string): Promise<Payment>
  readNotification(payload: string, signature: string | null): PaymentNotification
}
