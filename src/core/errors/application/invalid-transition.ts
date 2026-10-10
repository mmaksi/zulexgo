import { DomainError } from "@/src/core/errors/domain-error"

export class InvalidTransition extends DomainError {
  constructor(
    readonly status: string,
    readonly event: string,
  ) {
    super(`No transition from ${status} on ${event}`)
  }
}
