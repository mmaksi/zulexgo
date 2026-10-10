import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { DocumentKind, DocumentRef } from "@/src/core/domain/registration/document"

export interface StoredDocument {
  readonly kind: DocumentKind
  readonly bytes: Uint8Array
}

export interface DocumentStore {
  put(reference: ApplicationReference, document: DocumentRef, bytes: Uint8Array): Promise<void>
  // Personal data: callers check the status token before asking.
  get(reference: ApplicationReference, documentId: string): Promise<StoredDocument | undefined>
  list(reference: ApplicationReference): Promise<DocumentRef[]>
}
