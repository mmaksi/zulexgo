import { DomainError } from "@/src/core/errors/domain-error"

/**
 * Some of an order's money has already gone back (a cancel that got part of the
 * way, or a hold that lapsed), so it must not be put back at the KBA: it would
 * be processed for a price nobody paid.
 */
export class PaymentNoLongerWhole extends DomainError {
  constructor() {
    super("Part of this order's money has already gone back")
  }
}
