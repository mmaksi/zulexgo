import { DomainError } from "@/src/core/errors/domain-error"

export class ServiceNotOnSale extends DomainError {
  constructor() {
    super("This service is not on sale")
  }
}
