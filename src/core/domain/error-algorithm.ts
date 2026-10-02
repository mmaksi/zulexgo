import type { Failure } from "./failure"
import { REJECTION_CATALOGUE, type ErrorClass, type RejectionCatalogue } from "./rejection-catalogue"

/**
 * What to do about a failure. `retrySilently`: try again with the customer told nothing.
 * `failCorrectable`: 5b, the customer can correct or cancel. `failFinal`: 5c, with the
 * refund policy's outcome named by `refund`: `fee` keeps the processing fee (`failedFinal`),
 * `full` returns everything because the fault is ours (`ourTechnicalError`).
 */
export type FailureDecision =
  | { readonly action: "retrySilently" }
  | { readonly action: "failCorrectable" }
  | { readonly action: "failFinal"; readonly refund: "fee" | "full" }

/** Business logic §2: one automatic retry of a KBA technical error before the customer hears anything. */
export const MAX_SILENT_RETRIES = 1

/**
 * How long a submission that cannot be confirmed is resubmitted, silently.
 * A timeout does not prove the call failed: Zulex may hold the application, and
 * refunding early would let it be de-registered unpaid (D6). Launch plan Q23
 * (does a replayed idempotency key return the same application?) is still open;
 * this is the safe answer pending it.
 */
export const SUBMISSION_PATIENCE_MS = 24 * 60 * 60 * 1000

export interface Attempt {
  /** Silent retries already used since the last submission succeeded. */
  readonly retryAttempts: number
  /**
   * How long the application has waited to be filed, since payment was confirmed (or, after
   * a correction that files the order afresh, since it was refiled).
   */
  readonly waitedMs: number
}

/**
 * Business logic §2 in order: retry a technical error silently; then classify.
 * A KBA technical error gets one retry. A submission that cannot be confirmed
 * is resubmitted until `SUBMISSION_PATIENCE_MS` is used up, since no
 * application exists yet to ask the service to retry. A code the catalogue does
 * not know is treated as technical, so it still gets its retry, and ends
 * correctable, where the customer can still cancel for the fee 5c would keep.
 */
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
      return { action: "failCorrectable" }
    case "kbaError":
      return decideOnKbaError(catalogue[failure.code]?.class ?? "technical", canRetry)
  }
}

/**
 * A KBA error whose code the catalogue lacks: support reclassifies it (launch plan M6
 * fallback). `decideOnFailure` treats such a code as technical and says nothing, so this
 * is how a caller notices one to report.
 */
export const isUnrecognised = (
  failure: Failure,
  catalogue: RejectionCatalogue = REJECTION_CATALOGUE,
): failure is Extract<Failure, { kind: "kbaError" }> => failure.kind === "kbaError" && !(failure.code in catalogue)

/**
 * A final error ends the order at once (5c, fee kept); a technical one gets the silent retry
 * while one is left. Everything else, a technical error whose retry is used up included, is 5b.
 */
function decideOnKbaError(errorClass: ErrorClass, canRetry: boolean): FailureDecision {
  if (errorClass === "final") return { action: "failFinal", refund: "fee" }
  if (errorClass === "technical" && canRetry) return { action: "retrySilently" }
  return { action: "failCorrectable" }
}
