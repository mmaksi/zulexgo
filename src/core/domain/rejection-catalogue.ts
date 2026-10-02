import type { Failure } from "./failure"

/**
 * How the error algorithm treats a KBA error. `technical`: a fault that may pass, so one silent
 * retry, then 5b. `correctable`: wrong data the customer can fix, straight to 5b. `final`: cannot
 * be corrected, so 5c with the processing fee kept.
 */
export type ErrorClass = "technical" | "correctable" | "final"

export interface CatalogueEntry {
  readonly class: ErrorClass
  /** German, written by us for the customer: the vendor's own description never reaches one. */
  readonly reason: string
}

/** Keyed by the KBA's error code, the number carried by `Failure` of kind `kbaError`. */
export type RejectionCatalogue = Readonly<Record<number, CatalogueEntry>>

/**
 * KBA error code → class and customer wording. Empty until the founder's
 * Zulex error-code catalogue exists (launch plan Q10): every code then reads
 * as unknown. Adding a code is a data change with a test, not a code change.
 */
export const REJECTION_CATALOGUE: RejectionCatalogue = {}

/** For a failure whose cause we cannot name: the catalogue lacks the code, or there is none. */
const GENERAL = "Die Zulassungsstelle konnte den Antrag mit diesen Angaben nicht bearbeiten."
/** For a submission we could not confirm: the wording owns up to a technical fault on our side. */
const OUR_FAULT = "Wir konnten Ihren Antrag wegen einer technischen Störung nicht einreichen."

/**
 * What the customer is told went wrong; a code the catalogue lacks gets the general wording.
 * Never returns the vendor's description or the code itself.
 */
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
