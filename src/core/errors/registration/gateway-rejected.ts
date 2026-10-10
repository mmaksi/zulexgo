import { DomainError } from "@/src/core/errors/domain-error"

// A 400 to a replay says nothing about the attempt before it, which Zulex may still hold.
export class GatewayRejected extends DomainError {
  constructor() {
    super("The registration service rejected the application data")
  }
}
