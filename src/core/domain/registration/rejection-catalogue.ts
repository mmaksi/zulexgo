import type { Failure } from "./failure"

export type ErrorClass = "technical" | "correctable" | "final"

export interface CatalogueEntry {
  readonly class: ErrorClass
  readonly reason: string
}

export type RejectionCatalogue = Readonly<Record<number, CatalogueEntry>>

// Empty pending the founder's Zulex error-code catalogue (launch plan Q10).
export const REJECTION_CATALOGUE: RejectionCatalogue = {}

const GENERAL = "Die Zulassungsstelle konnte den Antrag mit diesen Angaben nicht bearbeiten."
const OUR_FAULT = "Wir konnten Ihren Antrag wegen einer technischen Störung nicht einreichen."

const IDENTITY_MISMATCH = "Die Angaben zu Name und Geburtsdatum stimmen nicht mit Ihrem Ausweis überein."
const IDENTITY_FAILED = "Ihre Identität konnte nicht bestätigt werden."

export function reasonFor(failure: Failure, catalogue: RejectionCatalogue = REJECTION_CATALOGUE): string {
  switch (failure.kind) {
    case "kbaError":
      return catalogue[failure.code]?.reason ?? GENERAL
    case "unavailable":
      return OUR_FAULT
    case "rejected":
    case "rejectionDocument":
      return GENERAL
    case "identityMismatch":
      return IDENTITY_MISMATCH
    case "identityFailed":
      return IDENTITY_FAILED
  }
}
