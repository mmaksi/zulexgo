import type { Beta } from "@/src/core/domain/application/beta"
import { BetaFull } from "@/src/core/errors/application/beta-full"
import { InviteRequired } from "@/src/core/errors/application/invite-required"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ValidationError } from "@/src/core/errors/validation-error"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { FAKE_CONSENTS, FAKE_NEW_REGISTRATION_CONSENTS, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import { setupFlow } from "./flow-harness"

const DAY = 24 * 60 * 60_000
const INVITE = "K7M2-QX9P"
const EMAIL = "erika.mustermann@example.test"

/**
 * Neuzulassung is on sale to people with an invite only, for two checkouts a day. The checkout is
 * where that is decided: a funnel's server action is reachable by any POST.
 */
function setup() {
  const flow = setupFlow()
  const beta: Beta = { invites: { newRegistration: [INVITE] }, dailyPlaces: 2 }
  const deps = { ...flow.deps, servicesOnSale: ["deregistration", "newRegistration"] as const, beta }
  const checkout = (invite: unknown, request: unknown = FAKE_NEW_REGISTRATION) =>
    submitCheckout(deps, { service: "newRegistration", request, email: EMAIL, consents: FAKE_NEW_REGISTRATION_CONSENTS, invite })
  const createPayment = jest.spyOn(deps.payments, "createPayment")
  return { flow, deps, checkout, createPayment }
}

describe("a checkout for a service in its beta", () => {
  it.each([undefined, "", "WRONG-CODE", 42])("is refused for the invite %p, before any payment is opened", async (invite) => {
    const { checkout, createPayment } = setup()

    await expect(checkout(invite)).rejects.toBeInstanceOf(InviteRequired)

    expect(createPayment).not.toHaveBeenCalled()
  })

  it("is taken from someone holding the invite, however they typed it", async () => {
    const { flow, checkout } = setup()

    const { reference } = await checkout(" k7m2-qx9p ")

    expect((await flow.stored(reference)).status).toBe("awaiting_payment")
  })

  it("is refused once the day's places are gone, and opens no payment for the refused one", async () => {
    const { checkout, createPayment } = setup()
    await checkout(INVITE)
    await checkout(INVITE)

    await expect(checkout(INVITE)).rejects.toBeInstanceOf(BetaFull)

    expect(createPayment).toHaveBeenCalledTimes(2)
  })

  it("is taken again a day after the first place was taken", async () => {
    const { flow, checkout } = setup()
    await checkout(INVITE)
    await checkout(INVITE)
    flow.clock.advance(DAY)

    await expect(checkout(INVITE)).resolves.toMatchObject({ reference: expect.any(String) })
  })

  it("costs no place when the form has to be corrected, or the car already has an order", async () => {
    const { flow, deps, checkout } = setup()
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(checkout(INVITE, { ...FAKE_NEW_REGISTRATION, vin: "short" })).rejects.toBeInstanceOf(ValidationError)
    }
    const { reference } = await checkout(INVITE)
    const paid = await flow.stored(reference)
    await deps.repository.update({ ...paid, status: "submitted_and_paid", history: [...paid.history, { status: "submitted_and_paid", at: flow.clock.now() }] })

    await expect(checkout(INVITE)).rejects.toBeInstanceOf(OpenApplicationExists)
    await expect(checkout(INVITE)).rejects.toBeInstanceOf(OpenApplicationExists)

    // Two places in all: one taken by the paid order, one still free for a car with no order.
    await expect(checkout(INVITE, { ...FAKE_NEW_REGISTRATION, vin: "FAKEVIN0000000099" })).resolves.toMatchObject({ reference: expect.any(String) })
  })

  it("refuses the checkout, never lets it through, when the limiter that counts the places cannot answer", async () => {
    const { deps, checkout, createPayment } = setup()
    jest.spyOn(deps.rateLimiter, "consume").mockRejectedValue(new Error("connection lost"))

    await expect(checkout(INVITE)).rejects.toThrow("connection lost")

    expect(createPayment).not.toHaveBeenCalled()
  })

  it("leaves a service outside the beta open to everyone, without an invite and without counting", async () => {
    const { deps, createPayment } = setup()

    for (let order = 0; order < 5; order++) {
      await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: EMAIL, consents: FAKE_CONSENTS })
    }

    expect(createPayment).toHaveBeenCalledTimes(5)
  })
})
