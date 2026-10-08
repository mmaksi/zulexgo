/** In the order the customer sees them: what they came for first. The status page sorts by it. */
export const DOCUMENT_KINDS = ["confirmation", "temporaryCertificate", "rejection", "fee", "unknown"] as const

/**
 * Documents the KBA produces, in our terms: `confirmation` is the Abmeldebescheinigung of a
 * de-registration or the registration's confirmation, `temporaryCertificate` the proof of registration
 * issued before the plates and papers arrive, `rejection` a refusal document, `fee` the authority's
 * charge. Anything we do not recognise is shown as a generic "Dokument".
 */
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export interface DocumentRef {
  /** The vendor's id, kept as a string: it is an int64, beyond what a JS number holds exactly. */
  readonly id: string
  readonly kind: DocumentKind
}
