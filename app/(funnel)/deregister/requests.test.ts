import { FAKE_CONSENTS } from "@/tests/fixtures/applications"
import { setupFlow } from "@/tests/integration/flow-harness"
import type { VehicleData } from "@/app/_components/vehicle-data"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { checkPrefix, startDeregistrationCheckout } from "./requests"

const VEHICLE: VehicleData = {
  prefix: "AAA",
  letters: "AA",
  numbers: "111",
  vin: "FAKEVIN0000000001",
  rearPlate: "AA1",
  frontPlate: "AA2",
  certificate: "AAAAAA1",
  email: "kunde@example.test",
}
const input = { plateCount: 2 as const, vehicle: VEHICLE, consents: FAKE_CONSENTS }
const HOUR_IN_MINUTES = 60
const from = (address: string) => new Headers({ "x-forwarded-for": address })

function setup() {
  const flow = setupFlow()
  return {
    ...flow,
    createPayment: jest.spyOn(flow.deps.payments, "createPayment"),
    findAuthorities: jest.spyOn(flow.deps.registration, "findAuthorities"),
  }
}

describe("checkPrefix", () => {
  it("names the authority's processing status for a plate prefix", async () => {
    expect(await checkPrefix(setup().deps, from("203.0.113.7"), "AAA")).toEqual({ ok: true, prefix: "AAA", ikfzStatus: "online" })
  })

  it("answers a prefix no authority has with its own reason, not as an outage", async () => {
    expect(await checkPrefix(setup().deps, from("203.0.113.7"), "1")).toEqual({ ok: false, reason: "invalidPrefix" })
  })

  it("asks the registration service for the first lookups of an address, then refuses and says how long to wait", async () => {
    const { deps, findAuthorities } = setup()
    const { max } = RATE_LIMITS.eligibilityLookup

    for (let lookup = 0; lookup < max; lookup++) expect(await checkPrefix(deps, from("203.0.113.7"), "AAA")).toMatchObject({ ok: true })
    const refused = await checkPrefix(deps, from("203.0.113.7"), "AAA")

    expect(refused).toEqual({ ok: false, reason: "limited", retryAfterMinutes: HOUR_IN_MINUTES })
    expect(findAuthorities).toHaveBeenCalledTimes(max)
  })

  it("refuses as unavailable when the rate limiter cannot answer, and asks nothing of the registration service", async () => {
    const { deps, findAuthorities } = setup()
    const log = jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(deps.rateLimiter, "consume").mockRejectedValue(new Error("connection refused"))

    expect(await checkPrefix(deps, from("203.0.113.7"), "AAA")).toEqual({ ok: false, reason: "unavailable" })
    expect(findAuthorities).not.toHaveBeenCalled()
    log.mockRestore()
  })
})

describe("startDeregistrationCheckout", () => {
  it("opens the order and its payment", async () => {
    const { deps, createPayment } = setup()

    expect(await startDeregistrationCheckout(deps, from("203.0.113.7"), input)).toMatchObject({ ok: true, reference: expect.stringMatching(/^ZG-/) })
    expect(createPayment).toHaveBeenCalledTimes(1)
  })

  it("answers invalid details as invalid, and a missing consent as one", async () => {
    const { deps } = setup()

    expect(await startDeregistrationCheckout(deps, from("203.0.113.7"), { ...input, vehicle: { ...VEHICLE, vin: "" } })).toEqual({ ok: false, reason: "invalid" })
    expect(await startDeregistrationCheckout(deps, from("203.0.113.7"), { ...input, consents: { terms: true } })).toEqual({ ok: false, reason: "consent" })
  })

  it("opens nothing once the address is over its limit: no order, no payment", async () => {
    const { deps, createPayment } = setup()
    const { max } = RATE_LIMITS.checkout
    // Invalid every time: the attempts count even though none of them opens anything.
    for (let attempt = 0; attempt < max; attempt++) await startDeregistrationCheckout(deps, from("203.0.113.7"), { ...input, vehicle: { ...VEHICLE, vin: "" } })

    const refused = await startDeregistrationCheckout(deps, from("203.0.113.7"), input)

    expect(refused).toEqual({ ok: false, reason: "limited", retryAfterMinutes: HOUR_IN_MINUTES })
    expect(createPayment).not.toHaveBeenCalled()
  })

  it("counts each address on its own, and a lookup does not use up a checkout", async () => {
    const { deps } = setup()
    for (let lookup = 0; lookup < RATE_LIMITS.eligibilityLookup.max; lookup++) await checkPrefix(deps, from("203.0.113.7"), "AAA")
    for (let attempt = 0; attempt < RATE_LIMITS.checkout.max; attempt++) await startDeregistrationCheckout(deps, from("198.51.100.9"), { ...input, consents: {} })

    expect(await startDeregistrationCheckout(deps, from("203.0.113.7"), input)).toMatchObject({ ok: true })
  })

  it("opens no order and no payment when the rate limiter cannot answer", async () => {
    const { deps, createPayment } = setup()
    const log = jest.spyOn(console, "error").mockImplementation(() => {})
    jest.spyOn(deps.rateLimiter, "consume").mockRejectedValue(new Error("connection refused"))

    expect(await startDeregistrationCheckout(deps, from("203.0.113.7"), input)).toEqual({ ok: false, reason: "unavailable" })
    expect(createPayment).not.toHaveBeenCalled()
    log.mockRestore()
  })

  describe("while de-registration is in its beta", () => {
    const inBeta = () => {
      const world = setup()
      return { ...world, deps: { ...world.deps, beta: { invites: { deregistration: ["DEREG-0001"] }, dailyPlaces: 1 } } }
    }

    it("opens the order for a customer holding the invite", async () => {
      const { deps } = inBeta()

      expect(await startDeregistrationCheckout(deps, from("203.0.113.7"), input, "DEREG-0001")).toMatchObject({ ok: true })
    })

    it("answers a customer without a valid invite as needing one, and opens nothing", async () => {
      const { deps, createPayment } = inBeta()

      expect(await startDeregistrationCheckout(deps, from("203.0.113.7"), input)).toEqual({ ok: false, reason: "invite" })
      expect(createPayment).not.toHaveBeenCalled()
    })

    it("answers the checkout after the day's places are gone as full", async () => {
      const { deps } = inBeta()
      await startDeregistrationCheckout(deps, from("203.0.113.7"), input, "DEREG-0001")

      expect(await startDeregistrationCheckout(deps, from("203.0.113.7"), input, "DEREG-0001")).toEqual({ ok: false, reason: "full" })
    })
  })
})
