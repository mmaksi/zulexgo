import { DomainError } from "@/src/core/errors/domain-error"

// Carries no reference or status: a stranger learns only that the vehicle is already in hand.
export class OpenApplicationExists extends DomainError {
  constructor() {
    super("An open order already exists for this vehicle")
  }
}
