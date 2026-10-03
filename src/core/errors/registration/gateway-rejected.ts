import { DomainError } from "@/src/core/errors/domain-error"

/**
 * The registration service refused the data (a 400). Retrying the same data would fail again.
 * A 400 answering the first attempt proves nothing was filed; one answering a replay says nothing
 * about the attempt before it, so the submission use case treats it as unconfirmed.
 */
export class GatewayRejected extends DomainError {
  constructor() {
    super("The registration service rejected the application data")
  }
}
