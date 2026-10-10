import type { Failure } from "./failure"
import { REJECTION_CATALOGUE, type ErrorClass, type RejectionCatalogue } from "./rejection-catalogue"

export type FailureDecision =
  | { readonly action: "retrySilently" }
  | { readonly action: "failCorrectable" }
  | { readonly action: "failFinal"; readonly refund: "fee" | "full" }

export const MAX_SILENT_RETRIES = 1

// Provisional: launch plan Q23. A timeout proves nothing: Zulex may hold the application.
export const SUBMISSION_PATIENCE_MS = 24 * 60 * 60 * 1000

export interface Attempt {
  readonly retryAttempts: number
  readonly waitedMs: number
}

export function decideOnFailure(
  failure: Failure,
  { retryAttempts, waitedMs }: Attempt,
  catalogue: RejectionCatalogue = REJECTION_CATALOGUE,
): FailureDecision {
  const canRetry = retryAttempts < MAX_SILENT_RETRIES

  switch (failure.kind) {
    case "unavailable":
      return waitedMs < SUBMISSION_PATIENCE_MS ? { action: "retrySilently" } : { action: "failFinal", refund: "full" }
    case "rejected":
    case "rejectionDocument":
    case "identityMismatch":
      return { action: "failCorrectable" }
    case "identityFailed":
      return { action: "failFinal", refund: "fee" }
    case "kbaError":
      return decideOnKbaError(catalogue[failure.code]?.class ?? "technical", canRetry)
  }
}

export const isUnrecognised = (
  failure: Failure,
  catalogue: RejectionCatalogue = REJECTION_CATALOGUE,
): failure is Extract<Failure, { kind: "kbaError" }> => failure.kind === "kbaError" && !(failure.code in catalogue)

function decideOnKbaError(errorClass: ErrorClass, canRetry: boolean): FailureDecision {
  if (errorClass === "final") return { action: "failFinal", refund: "fee" }
  if (errorClass === "technical" && canRetry) return { action: "retrySilently" }
  return { action: "failCorrectable" }
}
