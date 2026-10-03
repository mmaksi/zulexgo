import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { DocumentKind, DocumentRef } from "@/src/core/domain/registration/document"

/** A document as read back: its kind and the exact bytes the registration service delivered. */
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
  /**
   * The document's id names one document, so storing it again, even under a
   * different kind, replaces the old copy instead of adding a second. Safe to
   * repeat: when a later step fails, the next poll tick stores the documents
   * again. Rejects when the store cannot be written.
   */
  put(reference: ApplicationReference, document: DocumentRef, bytes: Uint8Array): Promise<void>
  /**
   * `undefined` when the id is not stored under this reference, which is also
   * what another application's document looks like: a caller cannot tell
   * "no such document" from "not yours". The documents are personal data, so
   * callers check the status token before asking.
   */
  get(reference: ApplicationReference, documentId: string): Promise<StoredDocument | undefined>
  /** Empty, not an error, for an application with no documents. */
  list(reference: ApplicationReference): Promise<DocumentRef[]>
}
