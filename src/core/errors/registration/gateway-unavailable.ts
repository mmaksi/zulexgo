import { DomainError } from "@/src/core/errors/domain-error"

export class GatewayUnavailable extends DomainError {
  constructor(readonly retryAfterMs?: number) {
    super("The registration service is temporarily unavailable")
  }
}
