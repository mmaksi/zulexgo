export const FAILURE_KINDS = ["unavailable", "rejected", "kbaError", "rejectionDocument"] as const

export type Failure =
  /** Timeout, 429 or 504 while submitting: the application never reached the KBA. */
  | { readonly kind: "unavailable" }
  /** The service refused the data at submission (a 400, which carries no body). */
  | { readonly kind: "rejected" }
  /** The KBA reported an error for a submitted application. */
  | { readonly kind: "kbaError"; readonly code: number }
  /** Finished, but with a rejection document instead of a confirmation (spec gap: no error code). */
  | { readonly kind: "rejectionDocument" }
