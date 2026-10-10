export const DOCUMENT_KINDS = ["confirmation", "temporaryCertificate", "rejection", "fee", "unknown"] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export interface DocumentRef {
  /** A string: the vendor's int64 is beyond what a JS number holds exactly. */
  readonly id: string
  readonly kind: DocumentKind
}
