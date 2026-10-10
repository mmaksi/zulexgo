import { requireOnSale } from "./on-sale"

const mockContainer = { servicesOnSale: ["deregistration"] as string[] }

jest.mock("@/src/config/container", () => ({ getContainer: () => mockContainer }))
jest.mock("next/server", () => ({ connection: async () => undefined }))

const notFound = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }

describe("a funnel's route", () => {
  afterEach(() => {
    mockContainer.servicesOnSale = ["deregistration"]
  })

  it("is not found for a service the deployment does not sell", async () => {
    await expect(requireOnSale("newRegistration")).rejects.toMatchObject(notFound)
  })

  it("exists for a service the deployment sells", async () => {
    mockContainer.servicesOnSale = ["deregistration", "newRegistration"]

    await expect(requireOnSale("newRegistration")).resolves.toBeUndefined()
  })

  it("is not found for de-registration either, if the deployment stopped selling it", async () => {
    mockContainer.servicesOnSale = ["newRegistration"]

    await expect(requireOnSale("deregistration")).rejects.toMatchObject(notFound)
  })
})
