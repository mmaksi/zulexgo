import { DomainError } from "@/src/core/errors/domain-error"

export class InviteRequired extends DomainError {
  constructor() {
    super("This service needs an invite")
  }
}
