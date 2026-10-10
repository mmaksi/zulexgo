import { DomainError } from "@/src/core/errors/domain-error"

export class PaymentNoLongerWhole extends DomainError {
  constructor() {
    super("Part of this order's money has already gone back")
  }
}
