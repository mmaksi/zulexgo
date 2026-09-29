export type ErrorClass = "technical" | "correctable" | "final"

/** KBA error code → class. Filled from the Zulex error-code catalogue once it exists (M6). */
export type ErrorCatalogue = Readonly<Record<number, ErrorClass>>

export const ERROR_CATALOGUE: ErrorCatalogue = {}

export type Failure =
  /** Timeout, 429 or 504 while submitting: the application never reached the KBA. */
  | { readonly kind: "unavailable" }
  /** The service refused the data at submission (a 400, which carries no body). */
  | { readonly kind: "rejected" }
  /** The KBA reported an error for a submitted application. */
  | { readonly kind: "kbaError"; readonly code: number }
  /** Finished, but with a rejection document instead of a confirmation (spec gap: no error code). */
  | { readonly kind: "rejectionDocument" }

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
  catalogue: ErrorCatalogue = ERROR_CATALOGUE,
): FailureDecision {
  const canRetry = retryAttempts < MAX_SILENT_RETRIES

  switch (failure.kind) {
    case "unavailable":
      return canRetry ? { action: "retrySilently" } : { action: "failFinal", refund: "full" }
    case "rejected":
    case "rejectionDocument":
      return { action: "failCorrectable" }
    case "kbaError":
      return decideOnKbaError(catalogue[failure.code] ?? "technical", canRetry)
  }
}

/** A KBA error whose code the catalogue lacks: support reclassifies it (launch plan M6 fallback). */
export const isUnrecognised = (
  failure: Failure,
  catalogue: ErrorCatalogue = ERROR_CATALOGUE,
): failure is Extract<Failure, { kind: "kbaError" }> => failure.kind === "kbaError" && !(failure.code in catalogue)

function decideOnKbaError(errorClass: ErrorClass, canRetry: boolean): FailureDecision {
  if (errorClass === "final") return { action: "failFinal", refund: "fee" }
  if (errorClass === "technical" && canRetry) return { action: "retrySilently" }
  return { action: "failCorrectable" }
}
