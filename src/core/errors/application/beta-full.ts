import { DomainError } from "@/src/core/errors/domain-error"

export class BetaFull extends DomainError {
  constructor() {
    super("The beta has no place left today")
  }
}
