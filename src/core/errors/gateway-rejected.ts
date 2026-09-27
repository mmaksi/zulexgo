import { DomainError } from "./domain-error"

/** The registration service refused the data (a 400). Retrying the same data would fail again. */
export class GatewayRejected extends DomainError {
  constructor() {
    super("The registration service rejected the application data")
  }
}
