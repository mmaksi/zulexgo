import { FAKE_CONSENTS } from "@/tests/fixtures/applications"
import { setupFlow } from "@/tests/integration/flow-harness"
import type { VehicleData } from "@/app/_components/vehicle-data"
import { startDeregistrationCheckout } from "./requests"

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

function setup() {
  const flow = setupFlow()
  return { ...flow, createPayment: jest.spyOn(flow.deps.payments, "createPayment") }
}

describe("startDeregistrationCheckout", () => {
  it("opens the order and its payment", async () => {
    const { deps, createPayment } = setup()

    expect(await startDeregistrationCheckout(deps, input)).toMatchObject({ ok: true, reference: expect.stringMatching(/^ZG-/) })
    expect(createPayment).toHaveBeenCalledTimes(1)
  })

  it("answers invalid details as invalid, and a missing consent as one", async () => {
    const { deps } = setup()

    expect(await startDeregistrationCheckout(deps, { ...input, vehicle: { ...VEHICLE, vin: "" } })).toEqual({ ok: false, reason: "invalid" })
    expect(await startDeregistrationCheckout(deps, { ...input, consents: { terms: true } })).toEqual({ ok: false, reason: "consent" })
  })

  describe("while de-registration is in its beta", () => {
    const inBeta = () => {
      const world = setup()
      return { ...world, deps: { ...world.deps, beta: { invites: { deregistration: ["DEREG-0001"] }, dailyPlaces: 1 } } }
    }

    it("opens the order for a customer holding the invite", async () => {
      const { deps } = inBeta()

      expect(await startDeregistrationCheckout(deps, input, "DEREG-0001")).toMatchObject({ ok: true })
    })

    it("answers a customer without a valid invite as needing one, and opens nothing", async () => {
      const { deps, createPayment } = inBeta()

      expect(await startDeregistrationCheckout(deps, input)).toEqual({ ok: false, reason: "invite" })
      expect(createPayment).not.toHaveBeenCalled()
    })

    it("answers the checkout after the day's places are gone as full", async () => {
      const { deps } = inBeta()
      await startDeregistrationCheckout(deps, input, "DEREG-0001")

      expect(await startDeregistrationCheckout(deps, input, "DEREG-0001")).toEqual({ ok: false, reason: "full" })
    })
  })
})
