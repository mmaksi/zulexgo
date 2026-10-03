import { DomainError } from "@/src/core/errors/domain-error"

/**
 * Checkout was asked for a service that is not sold. The message names no service: the value
 * came from the browser and may be anything.
 */
export class ServiceNotOnSale extends DomainError {
  constructor() {
    super("This service is not on sale")
  }
}
