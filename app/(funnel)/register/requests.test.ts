import { FAKE_NEW_REGISTRATION_CONSENTS } from "@/tests/fixtures/applications"
import { FILLED_REGISTRATION_FORM } from "@/tests/fixtures/registration-form"
import { setupFlow } from "@/tests/integration/flow-harness"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { checkPostcode, startRegistrationCheckout } from "./requests"

const HOUR_IN_MINUTES = 60
const from = (address: string) => new Headers({ "x-forwarded-for": address })

function setup() {
  const flow = setupFlow()
  const deps = { ...flow.deps, servicesOnSale: ["newRegistration" as const] }
  return { ...flow, deps, findAuthorities: jest.spyOn(deps.registration, "findAuthorities"), createPayment: jest.spyOn(deps.payments, "createPayment") }
}

describe("checkPostcode", () => {
  it("names the authority's processing status for a postcode", async () => {
    expect(await checkPostcode(setup().deps, from("203.0.113.7"), "10115")).toEqual({ ok: true, postcode: "10115", ikfzStatus: "online" })
  })

  it("answers a postcode no authority has with its own reason, not as an outage", async () => {
    expect(await checkPostcode(setup().deps, from("203.0.113.7"), "abc")).toEqual({ ok: false, reason: "invalidPostcode" })
  })

  it("asks the registration service for the first lookups of an address, then refuses and says how long to wait", async () => {
    const { deps, findAuthorities } = setup()
    const { max } = RATE_LIMITS.eligibilityLookup

    for (let lookup = 0; lookup < max; lookup++) expect(await checkPostcode(deps, from("203.0.113.7"), "10115")).toMatchObject({ ok: true })
    const refused = await checkPostcode(deps, from("203.0.113.7"), "10115")

    expect(refused).toEqual({ ok: false, reason: "limited", retryAfterMinutes: HOUR_IN_MINUTES })
    expect(findAuthorities).toHaveBeenCalledTimes(max)
  })

  it("counts a postcode that is wrong too, since a caller trying postcodes in bulk sends mostly those", async () => {
    const { deps, findAuthorities } = setup()
    const { max } = RATE_LIMITS.eligibilityLookup

    for (let lookup = 0; lookup < max; lookup++) await checkPostcode(deps, from("203.0.113.7"), "abc")

    expect(await checkPostcode(deps, from("203.0.113.7"), "10115")).toMatchObject({ ok: false, reason: "limited" })
    expect(findAuthorities).not.toHaveBeenCalled()
  })

  it("lets the address that is over its limit try again once the window has passed, and other addresses meanwhile", async () => {
    const { deps, clock } = setup()
    for (let lookup = 0; lookup <= RATE_LIMITS.eligibilityLookup.max; lookup++) await checkPostcode(deps, from("203.0.113.7"), "10115")

    expect(await checkPostcode(deps, from("198.51.100.9"), "10115")).toMatchObject({ ok: true })
    clock.advance(RATE_LIMITS.eligibilityLookup.windowMs)
    expect(await checkPostcode(deps, from("203.0.113.7"), "10115")).toMatchObject({ ok: true })
  })
})

describe("when the rate limiter itself cannot answer", () => {
  afterEach(() => jest.restoreAllMocks())

  it("refuses the postcode check as unavailable, asks nothing of the registration service, and logs the kind of error only", async () => {
    const { deps, findAuthorities } = setup()
    const log = jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(deps.rateLimiter, "consume").mockRejectedValue(new Error("connection to 203.0.113.7 refused"))

    expect(await checkPostcode(deps, from("203.0.113.7"), "10115")).toEqual({ ok: false, reason: "unavailable" })

    expect(findAuthorities).not.toHaveBeenCalled()
    expect(log.mock.calls.flat().join(" ")).not.toContain("203.0.113.7")
  })

  it("opens no order and no payment, rather than letting the checkout through unlimited", async () => {
    const { deps, createPayment } = setup()
    jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(deps.rateLimiter, "consume").mockRejectedValue(new Error("connection refused"))

    expect(await startRegistrationCheckout(deps, from("203.0.113.7"), { data: FILLED_REGISTRATION_FORM, consents: FAKE_NEW_REGISTRATION_CONSENTS })).toEqual({ ok: false, reason: "unavailable" })

    expect(createPayment).not.toHaveBeenCalled()
  })
})

describe("startRegistrationCheckout", () => {
  const input = { data: FILLED_REGISTRATION_FORM, consents: FAKE_NEW_REGISTRATION_CONSENTS }

  it("opens the order and its payment for a customer under the limit", async () => {
    const { deps, createPayment } = setup()

    const result = await startRegistrationCheckout(deps, from("203.0.113.7"), input)

    expect(result).toMatchObject({ ok: true, reference: expect.stringMatching(/^ZG-/) })
    expect(createPayment).toHaveBeenCalledTimes(1)
  })

  it("answers invalid details as invalid, and a missing consent as one", async () => {
    const { deps } = setup()

    expect(await startRegistrationCheckout(deps, from("203.0.113.7"), { ...input, data: { ...FILLED_REGISTRATION_FORM, iban: "" } })).toEqual({ ok: false, reason: "invalid" })
    expect(await startRegistrationCheckout(deps, from("203.0.113.7"), { ...input, consents: { terms: true } })).toEqual({ ok: false, reason: "consent" })
  })

  it("opens nothing once the address is over its limit: no order, no payment, no call to the registration service", async () => {
    const { deps, createPayment, findAuthorities } = setup()
    const { max } = RATE_LIMITS.checkout
    // Invalid every time: the attempts count even though none of them opens anything.
    for (let attempt = 0; attempt < max; attempt++) await startRegistrationCheckout(deps, from("203.0.113.7"), { ...input, data: { ...FILLED_REGISTRATION_FORM, iban: "" } })

    const refused = await startRegistrationCheckout(deps, from("203.0.113.7"), input)

    expect(refused).toEqual({ ok: false, reason: "limited", retryAfterMinutes: HOUR_IN_MINUTES })
    expect(createPayment).not.toHaveBeenCalled()
    expect(findAuthorities).not.toHaveBeenCalled()
  })

  it("counts each address on its own, and a lookup does not use up a checkout", async () => {
    const { deps } = setup()
    for (let lookup = 0; lookup < RATE_LIMITS.eligibilityLookup.max; lookup++) await checkPostcode(deps, from("203.0.113.7"), "10115")

    expect(await startRegistrationCheckout(deps, from("203.0.113.7"), input)).toMatchObject({ ok: true })
  })
})

describe("startRegistrationCheckout while Neuzulassung is in its beta", () => {
  const input = { data: FILLED_REGISTRATION_FORM, consents: FAKE_NEW_REGISTRATION_CONSENTS }
  const inBeta = () => {
    const world = setup()
    return { ...world, deps: { ...world.deps, beta: { invites: { newRegistration: ["K7M2-QX9P"] }, dailyPlaces: 1 } } }
  }

  it("opens the order for a customer holding the invite", async () => {
    const { deps, createPayment } = inBeta()

    expect(await startRegistrationCheckout(deps, from("203.0.113.7"), input, "K7M2-QX9P")).toMatchObject({ ok: true })
    expect(createPayment).toHaveBeenCalledTimes(1)
  })

  it("answers a customer without a valid invite as needing one, and opens nothing", async () => {
    const { deps, createPayment } = inBeta()

    expect(await startRegistrationCheckout(deps, from("203.0.113.7"), input)).toEqual({ ok: false, reason: "invite" })
    expect(await startRegistrationCheckout(deps, from("203.0.113.7"), input, "WRONG-CODE")).toEqual({ ok: false, reason: "invite" })
    expect(createPayment).not.toHaveBeenCalled()
  })

  it("answers the checkout after the day's places are gone as full", async () => {
    const { deps } = inBeta()
    await startRegistrationCheckout(deps, from("203.0.113.7"), input, "K7M2-QX9P")

    expect(await startRegistrationCheckout(deps, from("198.51.100.9"), input, "K7M2-QX9P")).toEqual({ ok: false, reason: "full" })
  })
})
