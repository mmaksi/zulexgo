import { Money } from "./money"

/** Retained on cancellation and on a non-correctable failure, whatever the service (business logic §3). It is part of the price, not added to it. */
export const PROCESSING_FEE = Money.ofCents(1999)

/** The founder's price: one all-inclusive amount, authority fee and processing fee included (PAngV). */
export const DEREGISTRATION_TOTAL = Money.ofCents(4900)
