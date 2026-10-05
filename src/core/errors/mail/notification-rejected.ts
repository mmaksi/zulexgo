import { DomainError } from "@/src/core/errors/domain-error"

/** A provider notification (payment, identity) that is unsigned, wrongly signed or unreadable. Nothing in it may be acted on. */
export class NotificationRejected extends DomainError {
  constructor() {
    super("The notification could not be verified")
  }
}
