import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { Service } from "@/src/core/domain/application/service"
import type { Email } from "@/src/core/domain/customer/email"
import type { Money } from "@/src/core/domain/payment/money"

export type PaymentStatus = "awaitingCustomer" | "held" | "captured" | "released"

export interface Payment {
  readonly id: string
  readonly status: PaymentStatus
  readonly amount: Money
  readonly captured: Money
  readonly refunded: Money
  readonly holdExpiresAt?: Date
  readonly registrationId?: string
}

export type PaymentNotification =
  | { readonly kind: "paymentReady"; readonly eventId: string; readonly reference: ApplicationReference }
  | { readonly kind: "ignored"; readonly eventId: string }

export interface PaymentProvider {
  // The Stripe adapter deliberately sends no email: the reference is its only link to the customer.
  createPayment(input: {
    reference: ApplicationReference
    service: Service
    amount: Money
    email: Email
  }): Promise<{ paymentId: string; clientSecret: string }>
  getPayment(paymentId: string): Promise<Payment>
  // Read `captured` from the result: a capture that won meanwhile (hold protection) may be larger.
  capture(paymentId: string, amount: Money): Promise<Payment>
  release(paymentId: string): Promise<Payment>
  refund(paymentId: string, amount: Money, idempotencyKey: string): Promise<Payment>
  recordRegistration(paymentId: string, registrationId: string): Promise<void>
  // `payload` is the raw body: the signature covers its bytes.
  readNotification(payload: string, signature: string | null): PaymentNotification
}
