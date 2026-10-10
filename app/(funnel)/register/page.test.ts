import RegisterPage from "./page"
import ConfirmationPage from "./bestaetigung/page"

const mockContainer = { servicesOnSale: ["deregistration"] as string[], env: { PAYMENT_DRIVER: "fake" } }

jest.mock("@/src/config/container", () => ({ getContainer: () => mockContainer }))
jest.mock("next/server", () => ({ connection: async () => undefined }))

const notFound = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
const confirmation = () => ConfirmationPage({ searchParams: Promise.resolve({}) } as never)

describe("the Neuzulassung funnel while the service is not on sale", () => {
  beforeEach(() => {
    mockContainer.servicesOnSale = ["deregistration"]
  })

  it("is not found, so no page collects personal data for an order nobody can place", async () => {
    await expect(RegisterPage()).rejects.toMatchObject(notFound)
  })

  it("keeps its confirmation page, which collects nothing: a customer who paid must land on it even after the service was taken off sale", async () => {
    await expect(confirmation()).resolves.toBeTruthy()
  })
})

describe("the Neuzulassung funnel on a deployment that sells it", () => {
  beforeEach(() => {
    mockContainer.servicesOnSale = ["deregistration", "newRegistration"]
  })

  it("renders the funnel", async () => {
    await expect(RegisterPage()).resolves.toBeTruthy()
  })

})
