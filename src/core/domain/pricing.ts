import { Money } from "./money"

/** Retained on cancellation and on a non-correctable failure, whatever the service (business logic §3). */
export const PROCESSING_FEE = Money.ofCents(1999)
