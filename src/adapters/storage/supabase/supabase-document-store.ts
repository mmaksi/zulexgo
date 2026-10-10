import { StorageClient, type StorageError } from "@supabase/storage-js"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { DOCUMENT_KINDS, type DocumentKind, type DocumentRef } from "@/src/core/domain/registration/document"
import type { DocumentStore, StoredDocument } from "@/src/core/ports/storage/document-store"

const OBJECT_NAME = new RegExp(`^(\\d+)\\.(${DOCUMENT_KINDS.join("|")})$`)

const objectName = ({ id, kind }: DocumentRef) => `${id}.${kind}`

export class SupabaseDocumentStore implements DocumentStore {
  private readonly bucket

  constructor({ url, bucket, serviceKey }: { url: string; bucket: string; serviceKey: string }) {
    const storage = new StorageClient(new URL("/storage/v1", url).toString().replace(/\/$/, ""), {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    })
    this.bucket = storage.from(bucket)
  }

  async put(reference: ApplicationReference, document: DocumentRef, bytes: Uint8Array): Promise<void> {
    const { error } = await this.bucket.upload(`${reference}/${objectName(document)}`, bytes.slice(), {
      contentType: "application/octet-stream",
      upsert: true,
    })
    if (error) throw storageFailure("put", error)
    await this.removeOtherKinds(reference, document)
  }

  // A caller's id is only compared with listed names, never spliced into a path, so it can't leave the folder.
  async get(reference: ApplicationReference, documentId: string): Promise<StoredDocument | undefined> {
    const document = (await this.list(reference)).find(({ id }) => id === documentId)
    if (!document) return undefined

    const { data, error } = await this.bucket.download(`${reference}/${objectName(document)}`)
    if (error) throw storageFailure("get", error)
    return { kind: document.kind, bytes: new Uint8Array(await data.arrayBuffer()) }
  }

  private async removeOtherKinds(reference: ApplicationReference, kept: DocumentRef): Promise<void> {
    const stale = (await this.list(reference)).filter(({ id, kind }) => id === kept.id && kind !== kept.kind)
    if (stale.length === 0) return

    const { error } = await this.bucket.remove(stale.map((document) => `${reference}/${objectName(document)}`))
    if (error) throw storageFailure("put", error)
  }

  // Storage lists 100 objects by default, far more than one application's few documents.
  async list(reference: ApplicationReference): Promise<DocumentRef[]> {
    const { data, error } = await this.bucket.list(reference)
    if (error) throw storageFailure("list", error)

    return data.flatMap(({ name }) => {
      const [, id, kind] = OBJECT_NAME.exec(name) ?? []
      return id ? [{ id, kind: kind as DocumentKind }] : []
    })
  }
}

function storageFailure(operation: string, { message, status }: StorageError) {
  return new Error(`Supabase Storage ${operation} failed${status ? ` (${status})` : ""}: ${message}`)
}
