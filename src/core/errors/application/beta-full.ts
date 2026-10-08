import { DomainError } from "@/src/core/errors/domain-error"

/** The service's beta has taken the day's number of checkouts; the next place frees a day after the first was taken. */
export class BetaFull extends DomainError {
  constructor() {
    super("The beta has no place left today")
  }
}
