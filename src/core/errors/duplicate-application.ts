import { DomainError } from "./domain-error"

/** A reference or idempotency key already exists: the caller generates a new reference, or has a double submit. */
export class DuplicateApplication extends DomainError {
  constructor(readonly field: "reference" | "idempotencyKey") {
    super(`An application with this ${field} already exists`)
  }
}
