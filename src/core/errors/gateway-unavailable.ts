import { DomainError } from "./domain-error"

/** Temporary: timeout, 429, 504, conflict. Safe to try again, after `retryAfterMs` when the service names it. */
export class GatewayUnavailable extends DomainError {
  constructor(readonly retryAfterMs?: number) {
    super("The registration service is temporarily unavailable")
  }
}
