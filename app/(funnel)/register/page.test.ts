import RegisterPage from "./page"
import ConfirmationPage from "./bestaetigung/page"

const mockContainer = { servicesOnSale: ["deregistration"] as string[], env: { PAYMENT_DRIVER: "fake" } }

jest.mock("@/src/config/container", () => ({ getContainer: () => mockContainer }))
jest.mock("next/server", () => ({ connection: async () => undefined }))

const notFound = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }
const confirmation = () => ConfirmationPage({ searchParams: Promise.resolve({}) } as never)

/**
 * The funnel collects an IBAN and a birth date, so it must not exist for a customer while checkout would refuse
 * the order. Whether it does is the deployment's setting (`SERVICES_ON_SALE`), staging's and production's apart.
 */
describe("the Neuzulassung funnel while the service is not on sale", () => {
  beforeEach(() => {
    mockContainer.servicesOnSale = ["deregistration"]
  })

  it("is not found, so no page collects personal data for an order nobody can place", async () => {
    await expect(RegisterPage()).rejects.toMatchObject(notFound)
  })

  it("has no confirmation page either", async () => {
    await expect(confirmation()).rejects.toMatchObject(notFound)
  })
})

describe("the Neuzulassung funnel on a deployment that sells it", () => {
  beforeEach(() => {
    mockContainer.servicesOnSale = ["deregistration", "newRegistration"]
  })

  it("renders the funnel", async () => {
    await expect(RegisterPage()).resolves.toBeTruthy()
  })

  it("renders the confirmation page", async () => {
    await expect(confirmation()).resolves.toBeTruthy()
  })
})
