import { anApplication } from "@/tests/fixtures/applications"
import type { ApplicationReference } from "@/src/core/domain/application-reference"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import { getDocumentByToken } from "./get-document-by-token"

const OWN_TOKEN = "faketoken-own"
const OTHER_TOKEN = "faketoken-other"
const own = anApplication({ status: "completed" })
const other = anApplication({ status: "completed" })
const confirmation = { id: "9007199254740993", kind: "confirmation" } as const
const bytes = new TextEncoder().encode("%PDF-fake")

const deps = {
  repository: {
    findByStatusToken: async (token: string) => ({ [OWN_TOKEN]: own, [OTHER_TOKEN]: other })[token],
  },
  documents: {
    get: async (reference: ApplicationReference, id: string) =>
      reference === own.reference && id === confirmation.id ? { kind: confirmation.kind, bytes } : undefined,
  },
}

describe("getDocumentByToken", () => {
  it("hands over a document of the application behind the link", async () => {
    expect(await getDocumentByToken(deps, OWN_TOKEN, confirmation.id)).toEqual({ reference: own.reference, kind: "confirmation", bytes })
  })

  it.each([
    ["an unknown link", "faketoken-unknown", confirmation.id],
    ["an empty link", "", confirmation.id],
    ["another order's link", OTHER_TOKEN, confirmation.id],
    ["a document this order does not have", OWN_TOKEN, "42"],
  ])("answers %s the same way, so nothing says whether the order or the document exists", async (_, token, documentId) => {
    await expect(getDocumentByToken(deps, token, documentId)).rejects.toBeInstanceOf(TokenInvalid)
  })
})
