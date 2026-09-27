import { DomainError } from "./domain-error"

/** The customer could not prove who they are, which makes the application non-correctable (5c). */
export class IdentityVerificationFailed extends DomainError {
  constructor(readonly reference: string) {
    super(`Identity verification failed for application ${reference}`)
  }
}
