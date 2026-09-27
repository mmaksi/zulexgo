import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { DocumentRef } from "@/src/core/domain/document"
import type { DocumentStore, StoredDocument } from "@/src/core/ports/document-store"

export class InMemoryDocumentStore implements DocumentStore {
  private readonly documents = new Map<ApplicationReference, Map<string, StoredDocument>>()

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
