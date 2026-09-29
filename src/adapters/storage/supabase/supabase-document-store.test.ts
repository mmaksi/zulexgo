import { HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { anApplication } from "@/tests/fixtures/applications"
import {
  STORAGE_TEST_BUCKET,
  STORAGE_TEST_KEY,
  STORAGE_TEST_URL,
  SupabaseStorageDouble,
} from "@/tests/msw/supabase-storage"
import type { DocumentRef } from "@/src/core/domain/document"
import { documentStoreContract } from "@/src/core/ports/document-store.contract"
import { SupabaseDocumentStore } from "./supabase-document-store"

let storage = new SupabaseStorageDouble()
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  storage = new SupabaseStorageDouble()
  server.resetHandlers(...storage.handlers)
})
afterAll(() => server.close())

const store = (overrides: Partial<ConstructorParameters<typeof SupabaseDocumentStore>[0]> = {}) =>
  new SupabaseDocumentStore({ url: STORAGE_TEST_URL, bucket: STORAGE_TEST_BUCKET, serviceKey: STORAGE_TEST_KEY, ...overrides })

documentStoreContract("SupabaseDocumentStore", () => store())

const confirmation: DocumentRef = { id: "9007199254740993", kind: "confirmation" }
const pdf = () => new TextEncoder().encode("%PDF-fake-confirmation")

describe("SupabaseDocumentStore", () => {
  it("keeps every application's documents under its own reference", async () => {
    const { reference } = anApplication()

    await store().put(reference, confirmation, pdf())

    expect([...storage.objects.keys()]).toEqual([`${reference}/${confirmation.id}.confirmation`])
  })

  it("finds nothing when the id is a path into someone else's folder", async () => {
    const owner = anApplication().reference
    const stranger = anApplication().reference
    await store().put(owner, confirmation, pdf())

    expect(await store().get(stranger, `../${owner}/${confirmation.id}`)).toBeUndefined()
    expect(await store().get(stranger, `${owner}/${confirmation.id}`)).toBeUndefined()
  })

  it("ignores objects in the folder it did not write", async () => {
    const { reference } = anApplication()
    await store().put(reference, confirmation, pdf())
    storage.objects.set(`${reference}/notes.txt`, { bytes: pdf(), contentType: null, createdAt: 99 })

    expect(await store().list(reference)).toEqual([confirmation])
  })

  it("refuses to work with the wrong key, rather than pretending nothing is stored", async () => {
    const { reference } = anApplication()

    await expect(store({ serviceKey: "sb_secret_wrong" }).put(reference, confirmation, pdf())).rejects.toThrow(/put/)
    await expect(store({ serviceKey: "sb_secret_wrong" }).get(reference, confirmation.id)).rejects.toThrow(/list/)
  })

  it("throws when Storage fails, so a document is never taken for missing", async () => {
    const { reference } = anApplication()
    await store().put(reference, confirmation, pdf())

    storage.failNext(HttpResponse.json({ statusCode: "500", error: "Internal", message: "boom" }, { status: 500 }))
    await expect(store().list(reference)).rejects.toThrow(/list/)

    storage.failNext(HttpResponse.json({ statusCode: "500", error: "Internal", message: "boom" }, { status: 500 }))
    await expect(store().put(reference, confirmation, pdf())).rejects.toThrow(/put/)
  })

  it("throws, not undefined, when a listed document cannot be read", async () => {
    const { reference } = anApplication()
    await store().put(reference, confirmation, pdf())

    storage.failNext(HttpResponse.json({ statusCode: "500", error: "Internal", message: "boom" }, { status: 500 }), "download")

    await expect(store().get(reference, confirmation.id)).rejects.toThrow(/get/)
  })
})
