import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import { FAKE_NEW_REGISTRATION_CONSENTS } from "@/tests/fixtures/applications"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ServiceNotOnSale } from "@/src/core/errors/application/service-not-on-sale"
import { ValidationError } from "@/src/core/errors/validation-error"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { setupFlow } from "./flow-harness"

function setup() {
  const flow = setupFlow()
  const deps = { ...flow.deps, servicesOnSale: ["deregistration", "newRegistration"] as const }
  const checkout = (request: unknown = FAKE_NEW_REGISTRATION, extra: { acknowledgedDuplicate?: boolean } = {}) =>
    submitCheckout(deps, { service: "newRegistration", request, email: "erika.mustermann@example.test", consents: FAKE_NEW_REGISTRATION_CONSENTS, ...extra })
  return { flow, deps, checkout }
}

describe("a Neuzulassung checkout", () => {
  it("opens a payment for the price list's price and stores the order awaiting payment, with everything the customer entered", async () => {
    const { flow, deps, checkout } = setup()
    const createPayment = jest.spyOn(deps.payments, "createPayment")

    const { reference } = await checkout()

    expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ reference, service: "newRegistration", amount: SERVICE_PRICES.newRegistration }))
    const order = await flow.stored(reference)
    expect(order).toMatchObject({ status: "awaiting_payment", payment: { total: SERVICE_PRICES.newRegistration } })
    expect(order.request).toMatchObject({ service: "newRegistration", vin: FAKE_NEW_REGISTRATION.vin, engineType: "combustion" })
    expect(order.request.service === "newRegistration" && order.request.owner.lastName).toBe("Mustermann")
  })

  it("is refused while the service is not on sale, whatever the funnel says", async () => {
    const { flow } = setup()

    await expect(
      submitCheckout(flow.deps, { service: "newRegistration", request: FAKE_NEW_REGISTRATION, email: "erika.mustermann@example.test", consents: FAKE_NEW_REGISTRATION_CONSENTS }),
    ).rejects.toBeInstanceOf(ServiceNotOnSale)
  })

  it("asks for the authority where the keeper lives, by postcode, and stores how it processes", async () => {
    const { flow, deps, checkout } = setup()
    deps.registration.setAuthorities("10115", [{ kreiscode: "11000", ikfzStatus: "offline" }])

    const { reference } = await checkout()

    expect((await flow.stored(reference)).ikfzStatus).toBe("offline")
  })

  it("refuses a postcode no authority answers for, naming the postcode, with nothing stored and no payment opened", async () => {
    const { deps, checkout } = setup()
    deps.registration.setAuthorities("10115", [])
    const createPayment = jest.spyOn(deps.payments, "createPayment")

    await expect(checkout()).rejects.toEqual(new ValidationError(["owner.address.postcode"]))

    expect(createPayment).not.toHaveBeenCalled()
  })

  it("checks the keeper's age against the server's own clock, not the browser's", async () => {
    const { checkout } = setup()
    const almostAdult = { ...FAKE_NEW_REGISTRATION, owner: { ...FAKE_NEW_REGISTRATION.owner, birthDate: "2008-03-02" } }

    await expect(checkout(almostAdult)).rejects.toEqual(new ValidationError(["owner.birthDate"]))
  })

  it("names every field the customer got wrong, never its value", async () => {
    const { checkout } = setup()
    const wrong = { ...FAKE_NEW_REGISTRATION, evbNumber: "FAKEEVI", bankAccount: { ...FAKE_NEW_REGISTRATION.bankAccount, iban: "DE00370400440532013000" } }

    const error = await checkout(wrong).catch((caught: unknown) => caught)

    expect(error).toEqual(new ValidationError(["evbNumber", "bankAccount.iban"]))
    expect(JSON.stringify(error)).not.toContain("FAKEEVI")
  })

  describe("a car that already has an open order", () => {
    it("warns when the same VIN is already being registered, and goes on only once the customer says so", async () => {
      const { flow, checkout } = setup()
      await flow.checkoutAndPayNewRegistration()

      await expect(checkout()).rejects.toBeInstanceOf(OpenApplicationExists)
      await expect(checkout(FAKE_NEW_REGISTRATION, { acknowledgedDuplicate: true })).resolves.toEqual({ reference: expect.any(String), clientSecret: expect.any(String) })
    })

    it("does not warn about a checkout nobody paid", async () => {
      const { checkout } = setup()
      await checkout()

      await expect(checkout()).resolves.toBeDefined()
    })
  })
})
