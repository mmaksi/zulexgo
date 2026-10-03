import { DomainError } from "@/src/core/errors/domain-error"

/** No application answers to this status link. Carries no token and says nothing about whether one existed. */
export class TokenInvalid extends DomainError {
  constructor() {
    super("This status link is not valid")
  }
}
