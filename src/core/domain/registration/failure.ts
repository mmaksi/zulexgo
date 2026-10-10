// Mirrored by the `failure_kind` check constraint: a new kind needs a migration too.
export const FAILURE_KINDS = ["unavailable", "rejected", "kbaError", "rejectionDocument", "identityFailed", "identityMismatch"] as const

export type Failure =
  | { readonly kind: "unavailable" }
  | { readonly kind: "rejected" }
  | { readonly kind: "kbaError"; readonly code: number }
  | { readonly kind: "rejectionDocument" }
  | { readonly kind: "identityFailed" }
  // Provisional: launch plan Q47
  | { readonly kind: "identityMismatch" }
