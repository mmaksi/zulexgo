import { DomainError } from "@/src/core/errors/domain-error"

/**
 * The status machine has no move for this event in this status, for example a cancel on an order
 * that is not at 5b. Carries both as plain strings, so this file need not import the status
 * machine that imports it. Callers answering a customer's request report it as "not possible".
 */
export class InvalidTransition extends DomainError {
  constructor(
    readonly status: string,
    readonly event: string,
  ) {
    super(`No transition from ${status} on ${event}`)
  }
}
