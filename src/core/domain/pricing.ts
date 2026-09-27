import { Money } from "./money"

/** Retained on cancellation and on a non-correctable failure, whatever the service (business logic §3). */
export const PROCESSING_FEE = Money.ofCents(1999)

/**
 * PLACEHOLDER until the founder sets the price (PAngV: one all-inclusive price,
 * launch plan). Every order is service price plus the processing fee.
 */
export const SERVICE_PRICE = Money.ofCents(5000)

export const DEREGISTRATION_TOTAL = SERVICE_PRICE.add(PROCESSING_FEE)
