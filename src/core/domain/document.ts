/** Documents the KBA produces, in our terms. Anything we do not recognise is shown as a generic "Dokument". */
export type DocumentKind = "confirmation" | "rejection" | "fee" | "unknown"

export interface DocumentRef {
  /** The vendor's id, kept as a string: it is an int64, beyond what a JS number holds exactly. */
  readonly id: string
  readonly kind: DocumentKind
}
