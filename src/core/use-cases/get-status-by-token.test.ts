import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { DocumentRef } from "@/src/core/domain/document"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import { getStatusByToken } from "./get-status-by-token"

const TOKEN = "faketoken-status"
const application = anApplication({ status: "submitted_to_kba" })
const repository = { findByStatusToken: async (token: string) => (token === TOKEN ? application : undefined) }
const storeOf = (stored: Map<ApplicationReference, DocumentRef[]> = new Map()) => ({ list: async (reference: ApplicationReference) => stored.get(reference) ?? [] })
const deps = { repository, documents: storeOf() }

describe("getStatusByToken", () => {
  it("describes the application behind a status link", async () => {
    const view = await getStatusByToken(deps, TOKEN)

    expect(view).toMatchObject({
      reference: application.reference,
      status: "submitted_to_kba",
      licencePlate: FAKE_REQUEST.licencePlate,
      vinEnding: "0001",
    })
    expect(view.steps.map((step) => step.id)).toEqual(["paid", "kba", "outcome"])
  })

  it("carries no security code and no full VIN, so the page cannot render one", async () => {
    const serialised = JSON.stringify(await getStatusByToken(deps, TOKEN))

    for (const code of Object.values(FAKE_REQUEST.codes)) expect(serialised).not.toContain(code)
    expect(serialised).not.toContain(FAKE_REQUEST.vin)
  })

  it.each(["faketoken-unknown", ""])("refuses a link no application answers to (%p)", async (token) => {
    await expect(getStatusByToken(deps, token)).rejects.toBeInstanceOf(TokenInvalid)
  })

  it("lists the documents stored for the order, the confirmation first, and none of another order's", async () => {
    const stranger = anApplication()
    const stored = new Map<ApplicationReference, DocumentRef[]>([
      [application.reference, [{ id: "8", kind: "fee" }, { id: "9", kind: "confirmation" }, { id: "7", kind: "unknown" }]],
      [stranger.reference, [{ id: "6", kind: "confirmation" }]],
    ])

    const view = await getStatusByToken({ repository, documents: storeOf(stored) }, TOKEN)

    expect(view.documents).toEqual([
      { id: "9", kind: "confirmation" },
      { id: "8", kind: "fee" },
      { id: "7", kind: "unknown" },
    ])
  })

  it("lists no documents for an order that has none", async () => {
    expect((await getStatusByToken(deps, TOKEN)).documents).toEqual([])
  })
})
