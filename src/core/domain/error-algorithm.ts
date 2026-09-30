import type { Failure } from "./failure"
import { REJECTION_CATALOGUE, type ErrorClass, type RejectionCatalogue } from "./rejection-catalogue"

export type FailureDecision =
  | { readonly action: "retrySilently" }
  | { readonly action: "failCorrectable" }
  | { readonly action: "failFinal"; readonly refund: "fee" | "full" }

/** Business logic §2: one automatic retry before the customer hears anything. */
export const MAX_SILENT_RETRIES = 1

/**
 * Business logic §2 in order: retry a technical error once, silently; then
 * classify. A code the catalogue does not know is treated as technical, so it
 * still gets the one retry the core principle promises, and ends correctable,
 * where the customer can still cancel for the same fee 5c would keep.
 */
export function decideOnFailure(
  failure: Failure,
  retryAttempts: number,
  catalogue: RejectionCatalogue = REJECTION_CATALOGUE,
): FailureDecision {
  const canRetry = retryAttempts < MAX_SILENT_RETRIES

  switch (failure.kind) {
    case "unavailable":
      return canRetry ? { action: "retrySilently" } : { action: "failFinal", refund: "full" }
    case "rejected":
    case "rejectionDocument":
      return { action: "failCorrectable" }
    case "kbaError":
      return decideOnKbaError(catalogue[failure.code]?.class ?? "technical", canRetry)
  }
}

/** A KBA error whose code the catalogue lacks: support reclassifies it (launch plan M6 fallback). */
export const isUnrecognised = (
  failure: Failure,
  catalogue: RejectionCatalogue = REJECTION_CATALOGUE,
): failure is Extract<Failure, { kind: "kbaError" }> => failure.kind === "kbaError" && !(failure.code in catalogue)

function decideOnKbaError(errorClass: ErrorClass, canRetry: boolean): FailureDecision {
  if (errorClass === "final") return { action: "failFinal", refund: "fee" }
  if (errorClass === "technical" && canRetry) return { action: "retrySilently" }
  return { action: "failCorrectable" }
}
