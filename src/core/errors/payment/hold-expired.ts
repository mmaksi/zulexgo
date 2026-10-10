import { DomainError } from "@/src/core/errors/domain-error"

export class HoldExpired extends DomainError {
  constructor(readonly paymentId: string) {
    super(`Payment ${paymentId} is no longer held`)
  }
}
