/** In the order the customer sees them: what they came for first. */
export const DOCUMENT_KINDS = ["confirmation", "rejection", "fee", "unknown"] as const

/** Documents the KBA produces, in our terms. Anything we do not recognise is shown as a generic "Dokument". */
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export interface DocumentRef {
  /** The vendor's id, kept as a string: it is an int64, beyond what a JS number holds exactly. */
  readonly id: string
  readonly kind: DocumentKind
}
