import { DomainError } from "./domain-error"

// Names the invalid fields, never their values: a rejected security code must not reach a log.
export class ValidationError extends DomainError {
  constructor(readonly fields: string[]) {
    super(`Invalid ${fields.join(", ")}`)
  }
}
