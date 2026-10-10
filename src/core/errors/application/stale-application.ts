import { DomainError } from "@/src/core/errors/domain-error"

export class StaleApplication extends DomainError {
  constructor(readonly reference: string) {
    super(`Application ${reference} was changed by someone else, or does not exist`)
  }
}
