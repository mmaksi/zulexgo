import { DomainError } from "@/src/core/errors/domain-error"

export class DuplicateApplication extends DomainError {
  constructor(readonly field: "reference" | "idempotencyKey") {
    super(`An application with this ${field} already exists`)
  }
}
