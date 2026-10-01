import type { Failure } from "./failure"

export type ErrorClass = "technical" | "correctable" | "final"

export interface CatalogueEntry {
  readonly class: ErrorClass
  /** German, written by us for the customer: the vendor's own description never reaches one. */
  readonly reason: string
}

export type RejectionCatalogue = Readonly<Record<number, CatalogueEntry>>

/**
 * KBA error code → class and customer wording. Empty until the founder's
 * Zulex error-code catalogue exists (launch plan Q10): every code then reads
 * as unknown. Adding a code is a data change with a test, not a code change.
 */
export const REJECTION_CATALOGUE: RejectionCatalogue = {}

const GENERAL = "Die Zulassungsstelle konnte den Antrag mit diesen Angaben nicht bearbeiten."
const OUR_FAULT = "Wir konnten Ihren Antrag wegen einer technischen Störung nicht einreichen."

/** What the customer is told went wrong; a code the catalogue lacks gets the general wording. */
export function reasonFor(failure: Failure, catalogue: RejectionCatalogue = REJECTION_CATALOGUE): string {
  switch (failure.kind) {
    case "kbaError":
      return catalogue[failure.code]?.reason ?? GENERAL
    case "unavailable":
      return OUR_FAULT
    case "rejected":
    case "rejectionDocument":
      return GENERAL
  }
}
