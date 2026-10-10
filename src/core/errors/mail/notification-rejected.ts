import { DomainError } from "@/src/core/errors/domain-error"

export class NotificationRejected extends DomainError {
  constructor() {
    super("The notification could not be verified")
  }
}
