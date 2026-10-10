import { anApplication } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW } from "@/tests/fixtures/new-registration"
import type { Application } from "@/src/core/domain/application/application"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"
import { HOUR, setupFlow as setup } from "./flow-harness"

describe("filing an order whose identity was verified after payment", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it("counts the patience for an unconfirmed filing from when the order became ready to be filed, not from payment", async () => {
    const flow = setup()
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    const reference = await flow.checkoutAndPay()

    flow.clock.advance(72 * HOUR)
    const waiting = await flow.stored(reference)
    await flow.deps.repository.update({
      ...waiting,
      history: [...waiting.history, { status: "identity_verified", at: flow.clock.now() }],
      polling: { attempts: 0, nextPollAt: flow.clock.now() },
    })
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    await flow.poll(60)

    expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
    expect(flow.emails()).toEqual(["orderConfirmation"])
  })

  it("still gives up with a full refund once a day has passed since it became ready, the clock having started there", async () => {
    const flow = setup()
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    const reference = await flow.checkoutAndPay()
    flow.clock.advance(72 * HOUR)
    const waiting = await flow.stored(reference)
    await flow.deps.repository.update({
      ...waiting,
      history: [...waiting.history, { status: "identity_verified", at: flow.clock.now() }],
      polling: { attempts: 0, nextPollAt: flow.clock.now() },
    })

    for (let hour = 0; hour < 25; hour++) {
      flow.deps.registration.failNext("submit", new GatewayUnavailable())
      await flow.poll(60)
    }

    expect((await flow.stored(reference)).status).toBe("failed_final")
    expect(await flow.payment(reference)).toMatchObject({ status: "released" })
  })

  describe("submitToKba, asked to file an order that has not been verified", () => {
    const unverified = (application: Application): Application => ({
      ...application,
      request: parseNewRegistrationRequest(FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW),
    })

    it("files nothing, takes no money and leaves it as it was, since it may only be filed at status 3", async () => {
      const flow = setup()
      const reference = await flow.payForCheckout()
      const paid = unverified(await flow.stored(reference))
      const atStatusOne = await flow.deps.repository.update({ ...paid, status: "submitted_and_paid", history: [...paid.history, { status: "submitted_and_paid", at: flow.clock.now() }] })

      await submitToKba(flow.deps, atStatusOne)

      expect(flow.deps.registration.submissions).toEqual([])
      expect(await flow.payment(reference)).toMatchObject({ status: "held" })
      expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
    })

    it("does file the same order once its identity is verified, from status 3", async () => {
      const flow = setup()
      const reference = await flow.payForCheckout()
      const paid = unverified(await flow.stored(reference))
      await flow.deps.repository.setStatusToken(reference, flow.deps.tokens.generate())
      const verified = await flow.deps.repository.update({
        ...paid,
        status: "identity_verified",
        history: [...paid.history, { status: "submitted_and_paid", at: flow.clock.now() }, { status: "identity_verified", at: flow.clock.now() }],
      })

      await submitToKba(flow.deps, verified)

      expect(flow.deps.registration.submissions).toHaveLength(1)
      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
    })

    it("is an ordinary de-registration's filing, unchanged: from status 1", async () => {
      const flow = setup()
      const reference = await flow.payForCheckout()
      await flow.confirm(reference)

      expect(flow.deps.registration.submissions).toHaveLength(1)
      expect(anApplication().request.service).toBe("deregistration")
    })
  })
})
