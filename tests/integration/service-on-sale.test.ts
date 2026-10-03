import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { ServiceNotOnSale } from "@/src/core/errors/application/service-not-on-sale"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { setupFlow } from "./flow-harness"

/**
 * Hiding a card on the landing page stops nothing: the server action behind a funnel is reachable
 * by any POST. What is sold is decided where the order is created.
 */
describe("checkout of a service that is not on sale", () => {
  it.each(["newRegistration", "reRegistration", "changeOfKeeper", "addressChange", "not-a-service"])(
    "refuses %s before any payment is opened",
    async (service) => {
      const { deps } = setupFlow()
      const createPayment = jest.spyOn(deps.payments, "createPayment")

      await expect(submitCheckout(deps, { service, request: FAKE_REQUEST, email: "customer@example.test" })).rejects.toBeInstanceOf(ServiceNotOnSale)

      expect(createPayment).not.toHaveBeenCalled()
    },
  )

  it("takes an order for a service that is on sale", async () => {
    const { deps } = setupFlow()

    const { reference } = await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test" })

    expect((await deps.repository.get(reference))?.request.service).toBe("deregistration")
  })
})
