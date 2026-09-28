import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import { getStatusByToken } from "./get-status-by-token"

const TOKEN = "faketoken-status"
const application = anApplication({ status: "submitted_to_kba" })
const repository = { findByStatusToken: async (token: string) => (token === TOKEN ? application : undefined) }

describe("getStatusByToken", () => {
  it("describes the application behind a status link", async () => {
    const view = await getStatusByToken({ repository }, TOKEN)

    expect(view).toMatchObject({
      reference: application.reference,
      status: "submitted_to_kba",
      licencePlate: FAKE_REQUEST.licencePlate,
      vinEnding: "0001",
    })
    expect(view.steps.map((step) => step.id)).toEqual(["paid", "kba", "outcome"])
  })

  it("carries no security code and no full VIN, so the page cannot render one", async () => {
    const serialised = JSON.stringify(await getStatusByToken({ repository }, TOKEN))

    for (const code of Object.values(FAKE_REQUEST.codes)) expect(serialised).not.toContain(code)
    expect(serialised).not.toContain(FAKE_REQUEST.vin)
  })

  it.each(["faketoken-unknown", ""])("refuses a link no application answers to (%p)", async (token) => {
    await expect(getStatusByToken({ repository }, token)).rejects.toBeInstanceOf(TokenInvalid)
  })
})
