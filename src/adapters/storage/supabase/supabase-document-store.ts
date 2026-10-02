import { StorageClient, type StorageError } from "@supabase/storage-js"
import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { DocumentKind, DocumentRef } from "@/src/core/domain/document"
import type { DocumentStore, StoredDocument } from "@/src/core/ports/document-store"

/**
 * Reads an object name back into a `DocumentRef`: Zulex's int64 document id (digits only) and our
 * kind. Anything else in an application's folder is not ours and `list` skips it.
 */
const OBJECT_NAME = /^(\d+)\.(confirmation|rejection|fee|unknown)$/

/** The kind is part of the name, so `list` can rebuild a `DocumentRef` without a database. */
const objectName = ({ id, kind }: DocumentRef) => `${id}.${kind}`

/**
 * `DocumentStore` on a private Supabase Storage bucket, one folder per
 * application: `<reference>/<zulex document id>.<kind>`. The bucket is never
 * public and the service key never leaves the server; the status page streams
 * a document only after its token checks out.
 *
 * An id from a caller is only ever compared with the names Storage lists for
 * the application, never spliced into a path, so it cannot reach another folder.
 *
 * Wired when `STORAGE_DRIVER=supabase`, each stage against its own Supabase project (production
 * rejects the in-memory fake). A document Storage does not have is `undefined`; every Storage
 * failure is a plain `Error` naming the operation and HTTP status, since the port has no domain
 * error for an outage.
 */
export class SupabaseDocumentStore implements DocumentStore {
  private readonly bucket

  /**
   * The service key bypasses row-level security and can read the whole project's storage, which is
   * why it is server-only and the bucket stays private.
   */
  constructor({ url, bucket, serviceKey }: { url: string; bucket: string; serviceKey: string }) {
    const storage = new StorageClient(new URL("/storage/v1", url).toString().replace(/\/$/, ""), {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    })
    this.bucket = storage.from(bucket)
  }

  /**
   * Uploads with `upsert`, so storing a document again replaces it as the port requires, then removes
   * a copy of the same id left under another kind. The two steps are not atomic: if the removal fails
   * `put` throws with both copies present, and `get` takes whichever `list` returns first until the
   * next successful `put`.
   */
  async put(reference: ApplicationReference, document: DocumentRef, bytes: Uint8Array): Promise<void> {
    // A generic content type: the kind lives in the object name, not in the file's metadata.
    const { error } = await this.bucket.upload(`${reference}/${objectName(document)}`, bytes.slice(), {
      contentType: "application/octet-stream",
      upsert: true,
    })
    if (error) throw storageFailure("put", error)
    await this.removeOtherKinds(reference, document)
  }

  /**
   * Two round trips: list the application's folder to find the object whose name carries this id,
   * then download it. A document listed but gone by the time of the download throws rather than
   * returning `undefined`.
   */
  async get(reference: ApplicationReference, documentId: string): Promise<StoredDocument | undefined> {
    const document = (await this.list(reference)).find(({ id }) => id === documentId)
    if (!document) return undefined

    const { data, error } = await this.bucket.download(`${reference}/${objectName(document)}`)
    if (error) throw storageFailure("get", error)
    return { kind: document.kind, bytes: new Uint8Array(await data.arrayBuffer()) }
  }

  /** An id names one document, so a copy stored under another kind is the old version of it. */
  private async removeOtherKinds(reference: ApplicationReference, kept: DocumentRef): Promise<void> {
    const stale = (await this.list(reference)).filter(({ id, kind }) => id === kept.id && kind !== kept.kind)
    if (stale.length === 0) return

    const { error } = await this.bucket.remove(stale.map((document) => `${reference}/${objectName(document)}`))
    // Reported as the `put` it belongs to.
    if (error) throw storageFailure("put", error)
  }

  /**
   * Reads only the first page of Storage's listing (its default is 100 objects), which is far more
   * than the few documents one application has.
   */
  async list(reference: ApplicationReference): Promise<DocumentRef[]> {
    const { data, error } = await this.bucket.list(reference)
    if (error) throw storageFailure("list", error)

    return data.flatMap(({ name }) => {
      const [, id, kind] = OBJECT_NAME.exec(name) ?? []
      return id ? [{ id, kind: kind as DocumentKind }] : []
    })
  }
}

/** Built from Storage's own error text and status plus the operation; adds no object path or bytes. */
function storageFailure(operation: string, { message, status }: StorageError) {
  return new Error(`Supabase Storage ${operation} failed${status ? ` (${status})` : ""}: ${message}`)
}
