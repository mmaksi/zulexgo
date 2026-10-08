import { DomainError } from "@/src/core/errors/domain-error"

/** The service is in its beta and the order came without a valid invite code. The message names no code: it came from the browser. */
export class InviteRequired extends DomainError {
  constructor() {
    super("This service needs an invite")
  }
}
