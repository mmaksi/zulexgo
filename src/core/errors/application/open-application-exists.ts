import { DomainError } from "@/src/core/errors/domain-error"

/**
 * A paid order for this plate and VIN is still open. Carries nothing about it:
 * no reference and no status, so the warning tells a stranger no more than
 * that the vehicle is already in hand.
 */
export class OpenApplicationExists extends DomainError {
  constructor() {
    super("An open order already exists for this vehicle")
  }
}
