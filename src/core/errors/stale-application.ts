import { DomainError } from "./domain-error"

/**
 * Someone else saved the application first (poller vs webhook): reload it and decide again.
 * Thrown by `update` when the stored version differs from the given one, and also when no such
 * application exists. Nothing was written.
 */
export class StaleApplication extends DomainError {
  constructor(readonly reference: string) {
    super(`Application ${reference} was changed by someone else, or does not exist`)
  }
}
