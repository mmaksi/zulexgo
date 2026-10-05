import { DomainError } from "@/src/core/errors/domain-error"

/**
 * Checkout was asked for without every consent its service requires. The message names none: the
 * browser decides what it sends, and the funnel does not let a customer pay without ticking them.
 */
export class ConsentRequired extends DomainError {
  constructor() {
    super("A required consent was not given")
  }
}
