import { DomainError } from "@/src/core/errors/domain-error"

/** The customer's payment was declined or abandoned (3-D Secure, insufficient funds): no application starts. */
export class PaymentDeclined extends DomainError {
  constructor(readonly paymentId: string) {
    super(`Payment ${paymentId} was declined`)
  }
}
