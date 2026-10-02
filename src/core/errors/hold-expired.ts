import { DomainError } from "./domain-error"

/**
 * The card hold is gone (expired or released), so nothing can be captured from it any more.
 * Thrown by `PaymentProvider.capture` and by payment settlement when there is no money to act
 * on. A hold that lapses while it is being captured is caught and logged, not fatal.
 */
export class HoldExpired extends DomainError {
  constructor(readonly paymentId: string) {
    super(`Payment ${paymentId} is no longer held`)
  }
}
