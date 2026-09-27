import { DomainError } from "./domain-error"

/** Someone else saved the application first (poller vs webhook): reload it and decide again. */
export class StaleApplication extends DomainError {
  constructor(readonly reference: string) {
    super(`Application ${reference} was changed by someone else, or does not exist`)
  }
}
