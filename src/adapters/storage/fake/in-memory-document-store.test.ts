import { anApplication } from "@/tests/fixtures/applications"
import { documentStoreContract } from "@/src/core/ports/storage/document-store.contract"
import { InMemoryDocumentStore } from "./in-memory-document-store"

documentStoreContract("InMemoryDocumentStore", () => new InMemoryDocumentStore())

describe("InMemoryDocumentStore", () => {
  it("starts with the documents it is seeded with", async () => {
    const { reference } = anApplication()
    const document = { id: "5", kind: "confirmation" } as const
    const store = new InMemoryDocumentStore([{ reference, document, bytes: new Uint8Array([1]) }])

    expect(await store.list(reference)).toEqual([document])
    expect(await store.get(reference, "5")).toEqual({ kind: "confirmation", bytes: new Uint8Array([1]) })
  })
})
