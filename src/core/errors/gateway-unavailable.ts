import { DomainError } from "./domain-error"

/**
 * Temporary: a timeout or network failure, 429, 409 (conflict) or any 5xx. Safe to try again, after
 * `retryAfterMs` (the service's Retry-After, in milliseconds) when it names one. A timeout does not
 * prove a submission failed, so a resubmission reuses the idempotency key.
 */
export class GatewayUnavailable extends DomainError {
  constructor(readonly retryAfterMs?: number) {
    super("The registration service is temporarily unavailable")
  }
}
