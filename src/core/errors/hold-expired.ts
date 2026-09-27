import { DomainError } from "./domain-error"

/** The card hold is gone (expired or released), so nothing can be captured from it any more. */
export class HoldExpired extends DomainError {
  constructor(readonly paymentId: string) {
    super(`Payment ${paymentId} is no longer held`)
  }
}
