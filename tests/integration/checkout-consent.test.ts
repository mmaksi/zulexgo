import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import { FAKE_CONSENTS, FAKE_NEW_REGISTRATION_CONSENTS, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { LEGAL_TEXT_VERSIONS } from "@/src/core/domain/application/consent"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { setupFlow } from "./flow-harness"

/**
 * Launch plan D9: what the customer agreed to is kept with the order, and an order cannot be made
 * without it. A funnel's server action is reachable by any POST, so the use case is the gate, not the
 * checkboxes.
 */
function checkoutOf(service: "deregistration" | "newRegistration") {
  const flow = setupFlow()
  const deps = { ...flow.deps, servicesOnSale: ["deregistration", "newRegistration"] as const }
  const sent = service === "deregistration"
    ? { service, request: FAKE_REQUEST, consents: FAKE_CONSENTS }
    : { service, request: FAKE_NEW_REGISTRATION, consents: FAKE_NEW_REGISTRATION_CONSENTS }
  return { flow, deps, sent, submit: (override: Partial<typeof sent> = {}) => submitCheckout(deps, { ...sent, email: "customer@example.test", ...override }) }
}

describe("consent at checkout", () => {
  it("keeps the AGB version and the moment the customer agreed with a de-registration", async () => {
    const { flow, submit } = checkoutOf("deregistration")

    const { reference } = await submit()

    expect((await flow.stored(reference)).consent).toEqual({ agbVersion: LEGAL_TEXT_VERSIONS.agb, givenAt: flow.clock.now() })
  })

  it("keeps the power of attorney's version too with a Neuzulassung", async () => {
    const { flow, submit } = checkoutOf("newRegistration")

    const { reference } = await submit()

    expect((await flow.stored(reference)).consent).toEqual({
      agbVersion: LEGAL_TEXT_VERSIONS.agb,
      powerOfAttorneyVersion: LEGAL_TEXT_VERSIONS.powerOfAttorney,
      givenAt: flow.clock.now(),
    })
  })

  it.each([
    ["deregistration", { terms: true }],
    ["deregistration", { terms: true, earlyStart: false }],
    ["deregistration", undefined],
    ["newRegistration", { terms: true, earlyStart: true }],
    ["newRegistration", { terms: true, powerOfAttorney: true }],
    ["newRegistration", {}],
  ] as const)("refuses a %s checkout with consents %j, before any payment is opened and with nothing stored", async (service, consents) => {
    const { flow, submit } = checkoutOf(service)
    const createPayment = jest.spyOn(flow.deps.payments, "createPayment")
    const create = jest.spyOn(flow.deps.repository, "create")

    await expect(submit({ consents } as never)).rejects.toBeInstanceOf(ConsentRequired)

    expect(createPayment).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
