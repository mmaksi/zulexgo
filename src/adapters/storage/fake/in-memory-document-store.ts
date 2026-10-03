import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { DocumentRef } from "@/src/core/domain/registration/document"
import type { DocumentStore, StoredDocument } from "@/src/core/ports/storage/document-store"

/**
 * `DocumentStore` in process memory: documents live per application reference, keyed by the vendor's
 * document id, so storing an id again replaces it whatever its kind (the Supabase adapter removes
 * the old kind to match). Bytes are copied in and out, as the port requires.
 *
 * Wired when `STORAGE_DRIVER=fake`, the default outside production (production rejects it at boot),
 * and used directly by tests. Nothing survives a restart and nothing is shared between instances.
 */
export class InMemoryDocumentStore implements DocumentStore {
  private readonly documents = new Map<ApplicationReference, Map<string, StoredDocument>>()

  /** Loads seed documents, so a dev server starts with something to download. */
  constructor(seed: readonly { reference: ApplicationReference; document: DocumentRef; bytes: Uint8Array }[] = []) {
    for (const { reference, document, bytes } of seed) {
      const forApplication = this.documents.get(reference) ?? new Map<string, StoredDocument>()
      forApplication.set(document.id, { kind: document.kind, bytes: bytes.slice() })
      this.documents.set(reference, forApplication)
    }
  }

  async put(reference: ApplicationReference, { id, kind }: DocumentRef, bytes: Uint8Array): Promise<void> {
    const forApplication = this.documents.get(reference) ?? new Map<string, StoredDocument>()
    forApplication.set(id, { kind, bytes: bytes.slice() })
    this.documents.set(reference, forApplication)
  }

  async get(reference: ApplicationReference, documentId: string): Promise<StoredDocument | undefined> {
    const document = this.documents.get(reference)?.get(documentId)
    return document && { kind: document.kind, bytes: document.bytes.slice() }
  }

  async list(reference: ApplicationReference): Promise<DocumentRef[]> {
    return [...(this.documents.get(reference) ?? new Map<string, StoredDocument>())].map(([id, { kind }]) => ({ id, kind }))
  }
}
