import { DomainError } from "@/src/core/errors/domain-error"

/**
 * A reference or idempotency key already exists: the caller generates a new reference, or has a
 * double submit. `field` says which: checkout retries a taken reference with a new one, but a
 * taken idempotency key is raised. Thrown by `create`, and by `update` when it changes the
 * idempotency key to one another application holds.
 */
export class DuplicateApplication extends DomainError {
  constructor(readonly field: "reference" | "idempotencyKey") {
    super(`An application with this ${field} already exists`)
  }
}
