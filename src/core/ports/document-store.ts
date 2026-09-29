import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { DocumentKind, DocumentRef } from "@/src/core/domain/document"

export interface StoredDocument {
  readonly kind: DocumentKind
  readonly bytes: Uint8Array
}

/**
 * Our copy of the KBA documents, so the status page serves them without calling
 * the registration service on every download.
 *
 * Guarantees every adapter must honour:
 * - Documents are scoped to their application: asking for a document id under
 *   another application's reference finds nothing.
 * - Bytes and kind round-trip unchanged, and storing the same document again
 *   replaces it rather than duplicating it.
 * - Stored and returned bytes are copies: mutating either side changes nothing.
 * - `list` returns each stored document once, in no particular order.
 */
export interface DocumentStore {
  put(reference: ApplicationReference, document: DocumentRef, bytes: Uint8Array): Promise<void>
  get(reference: ApplicationReference, documentId: string): Promise<StoredDocument | undefined>
  list(reference: ApplicationReference): Promise<DocumentRef[]>
}
