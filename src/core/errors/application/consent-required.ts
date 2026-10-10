import { DomainError } from "@/src/core/errors/domain-error"

export class ConsentRequired extends DomainError {
  constructor() {
    super("A required consent was not given")
  }
}
