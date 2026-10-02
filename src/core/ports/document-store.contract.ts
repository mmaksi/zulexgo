import { anApplication } from "@/tests/fixtures/applications"
import type { DocumentRef } from "@/src/core/domain/document"
import type { DocumentStore } from "./document-store"

// 2^53 + 1: a JS number cannot hold it, so an adapter that coerces ids to numbers is caught.
const confirmation: DocumentRef = { id: "9007199254740993", kind: "confirmation" }
const pdf = () => new TextEncoder().encode("%PDF-fake-confirmation")

/**
 * Every DocumentStore adapter must pass this, including the fake.
 *
 * Pins down the port's guarantees: bytes and kind round-trip; documents are
 * scoped to their application, so another reference finds nothing through
 * `get` or `list`; storing a document id again replaces it, even under another
 * kind, rather than listing it twice; bytes are copied on the way in and out.
 */
export function documentStoreContract(name: string, makeSubject: () => DocumentStore) {
  describe(`DocumentStore contract: ${name}`, () => {
    let store: DocumentStore
    beforeEach(() => {
      store = makeSubject()
    })

    it("returns what was stored, bytes and kind", async () => {
      const { reference } = anApplication()

      await store.put(reference, confirmation, pdf())

      expect(await store.get(reference, confirmation.id)).toEqual({ kind: "confirmation", bytes: pdf() })
    })

    it("finds nothing under another application's reference, so one customer cannot fetch another's document", async () => {
      const owner = anApplication().reference
      const stranger = anApplication().reference
      await store.put(owner, confirmation, pdf())

      expect(await store.get(stranger, confirmation.id)).toBeUndefined()
      expect(await store.list(stranger)).toEqual([])
    })

    it("replaces a document stored twice instead of listing it twice", async () => {
      const { reference } = anApplication()
      const rejection: DocumentRef = { id: "42", kind: "rejection" }

      await store.put(reference, confirmation, pdf())
      await store.put(reference, confirmation, new TextEncoder().encode("%PDF-replaced"))
      await store.put(reference, rejection, pdf())

      expect(await store.list(reference)).toHaveLength(2)
      expect(await store.list(reference)).toEqual(expect.arrayContaining([confirmation, rejection]))
      expect(new TextDecoder().decode((await store.get(reference, confirmation.id))?.bytes)).toBe("%PDF-replaced")
    })

    // The vendor's id names one document: a copy filed under another kind is its old version, not a
    // second document.
    it("lists a document once even when it is stored again under another kind", async () => {
      const { reference } = anApplication()

      await store.put(reference, { id: "42", kind: "unknown" }, pdf())
      await store.put(reference, { id: "42", kind: "confirmation" }, pdf())

      expect(await store.list(reference)).toEqual([{ id: "42", kind: "confirmation" }])
      expect((await store.get(reference, "42"))?.kind).toBe("confirmation")
    })

    it("keeps its own copy, so changing the bytes after storing them changes nothing", async () => {
      const { reference } = anApplication()
      const bytes = pdf()

      await store.put(reference, confirmation, bytes)
      bytes.fill(0)

      expect((await store.get(reference, confirmation.id))?.bytes).toEqual(pdf())
    })

    it("hands out a copy of the bytes", async () => {
      const { reference } = anApplication()
      await store.put(reference, confirmation, pdf())

      ;(await store.get(reference, confirmation.id))!.bytes.fill(0)

      expect((await store.get(reference, confirmation.id))?.bytes).toEqual(pdf())
    })
  })
}
