/**
 * Every kind of failure. The `failure_kind` check constraint (migration 0006) mirrors this
 * list, so a new kind needs a migration too.
 */
export const FAILURE_KINDS = ["unavailable", "rejected", "kbaError", "rejectionDocument", "identityFailed", "identityMismatch"] as const

/**
 * Why an application is failing or failed, stored on it so the status page and the emails can
 * say so. `decideOnFailure` classifies it and `reasonFor` words it for the customer. For a KBA
 * error only the code is kept, never the vendor's description.
 */
export type Failure =
  /**
   * Timeout, 429, 5xx or any other answer that does not confirm a submission. A timeout
   * proves nothing: the service may hold the application, so it is resubmitted under the
   * same idempotency key rather than assumed never to have reached the KBA.
   */
  | { readonly kind: "unavailable" }
  /** The service refused the data at submission (a 400, which carries no body). */
  | { readonly kind: "rejected" }
  /** The KBA reported an error for a submitted application. */
  | { readonly kind: "kbaError"; readonly code: number }
  /** Finished, but with a rejection document instead of a confirmation (spec gap: no error code). */
  | { readonly kind: "rejectionDocument" }
  /** The identity provider could not verify the customer: nothing can be done with the order (business logic §2). */
  | { readonly kind: "identityFailed" }
  /** The verified person is not the owner the order names (launch plan Q47, provisional): nothing was filed, so the customer can correct it. */
  | { readonly kind: "identityMismatch" }
