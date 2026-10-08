import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { Service } from "@/src/core/domain/application/service"
import type { Email } from "@/src/core/domain/customer/email"
import type { Money } from "@/src/core/domain/payment/money"

/**
 * How a customer pays. The port never asks for one, since the customer chooses
 * in the browser; it appears only where a fake or a test plays the customer.
 */
export type PaymentMethodKind = "card" | "sepaDebit"

/**
 * `held`: a card authorised but not yet taken. `captured`: money taken, which
 * SEPA Direct Debit is at checkout. `released`: a hold let go, by us or by expiry.
 * `awaitingCustomer`: nothing held or taken yet, which also covers any provider
 * state the port does not model.
 */
export type PaymentStatus = "awaitingCustomer" | "held" | "captured" | "released"

export interface Payment {
  /** The provider's id for the payment; the application stores it to find the payment again. */
  readonly id: string
  readonly status: PaymentStatus
  /** What the customer was asked to pay in all. */
  readonly amount: Money
  /** What has actually been taken: nothing before capture, after a partial one only that part. */
  readonly captured: Money
  /** What has gone back out of `captured`: never more, and nothing for a released hold. */
  readonly refunded: Money
  /** Only while held: after this the provider releases the hold (7 days for an online card payment). */
  readonly holdExpiresAt?: Date
  /** The registration service's id for the application, once recorded, so a payment can be reconciled with its fees. */
  readonly registrationId?: string
}

/**
 * What a provider notification means for an application. `paymentReady`: the
 * money is held, or taken where it cannot be held, so the application may
 * start. Everything else is not acted on yet.
 */
export type PaymentNotification =
  /** `eventId` is the provider's id for the event and is the same on every redelivery. */
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
 * - `refunded` never exceeds `captured`: a released hold reports nothing refunded, whatever
 *   the provider calls its reversal.
 * - `refund` needs captured money and never exceeds captured minus refunded.
 *   The same idempotency key refunds once, however often it is sent.
 * - `recordRegistration` works in every payment state; recording the same id
 *   again changes nothing.
 * - `readNotification` trusts only a payload signed by the provider; anything
 *   unsigned or altered throws `NotificationRejected`. The same notification
 *   may arrive twice, so acting on it must be safe to repeat.
 */
export interface PaymentProvider {
  /**
   * The reference is what a repeat is recognised by. `service` is what the payment is for, so the
   * provider's own records say which service took the money. `clientSecret` is what
   * the browser needs to confirm the payment; the server never does. `email` is
   * offered to adapters, but the Stripe adapter deliberately sends none: the
   * reference is its only link to the customer.
   */
  createPayment(input: {
    reference: ApplicationReference
    service: Service
    amount: Money
    email: Email
  }): Promise<{ paymentId: string; clientSecret: string }>
  /**
   * Reads the provider's current state on every call, so a hold that has since
   * expired already shows as `released`. An id the provider does not know
   * rejects with the adapter's own error.
   */
  getPayment(paymentId: string): Promise<Payment>
  /**
   * Takes `amount` from a hold and lets go of the rest. An amount above what
   * was held is a `RangeError`. A payment that is already `captured` is
   * returned as it is, whatever amount is asked, so a rerun never takes twice. Read
   * `captured` of the result, not the amount asked: a capture that won in the meantime
   * (hold protection takes a whole hold) can be larger.
   * Anything else that is not held (released, or never paid) is
   * `HoldExpired`.
   */
  capture(paymentId: string, amount: Money): Promise<Payment>
  /**
   * Lets a hold go and returns the payment as `released`; one already released
   * is returned unchanged. Captured money is not released but refunded, and
   * asking is a `RangeError`.
   */
  release(paymentId: string): Promise<Payment>
  /**
   * Gives `amount` of captured money back. The key is checked first, so a
   * rerun of a refund that already happened returns the payment as it is, with
   * no new refund and no `RangeError`, whatever amount it carries. Otherwise
   * `RangeError` when nothing is captured (a hold is released instead) or
   * `amount` exceeds what is captured and not yet refunded.
   */
  refund(paymentId: string, amount: Money, idempotencyKey: string): Promise<Payment>
  /**
   * Notes the registration service's id on the payment, so it can be reconciled
   * with that service's fees. Bookkeeping only: the use case that calls it logs
   * a failure and carries on.
   */
  recordRegistration(paymentId: string, registrationId: string): Promise<void>
  /**
   * Synchronous. `payload` is the request body exactly as received, since the
   * signature covers its bytes; `signature` is the provider's signature header,
   * or `null` when the request had none. A validly signed event that is not
   * about one of our orders, or not about a payment becoming ready, comes back
   * as `ignored` with its `eventId`.
   */
  readNotification(payload: string, signature: string | null): PaymentNotification
}
