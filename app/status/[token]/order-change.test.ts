import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { CODES, setupFlow } from "@/tests/integration/flow-harness"
import { RATE_LIMITS } from "@/src/core/domain/rate-limits"
import { cancelOrder } from "./order-change"

const headers = new Headers({ "x-forwarded-for": "203.0.113.7" })

async function correctableOrder() {
  const flow = setupFlow()
  flow.deps.registration.failNext("submit", new GatewayRejected())
  const reference = await flow.checkoutAndPay("card")
  return { ...flow, reference, token: (await flow.deps.repository.getStatusToken(reference))! }
}

describe("cancelOrder", () => {
  it("cancels an order that waits for a correction", async () => {
    const { deps, stored, reference, token } = await correctableOrder()

    expect(await cancelOrder(deps, headers, token)).toEqual({ status: "done" })
    expect((await stored(reference)).status).toBe("cancelled")
  })

  it("does nothing more when asked again for an order it already cancelled", async () => {
    const { deps, token, payment, reference } = await correctableOrder()
    await cancelOrder(deps, headers, token)
    const after = await payment(reference)

    expect(await cancelOrder(deps, headers, token)).toEqual({ status: "done" })
    expect(await payment(reference)).toEqual(after)
  })

  it("answers alike for a link that opens nothing and for an order that cannot be cancelled, so it tells nothing about either", async () => {
    const flow = setupFlow()
    const reference = await flow.checkoutAndPay("card")

    expect(await cancelOrder(flow.deps, headers, "faketoken-unknown")).toEqual({ status: "notPossible" })
    expect(await cancelOrder(flow.deps, headers, (await flow.deps.repository.getStatusToken(reference))!)).toEqual({ status: "notPossible" })
  })

  it("counts every attempt, right link or wrong, against the caller's address, and moves no money once over the limit", async () => {
    const { deps, payment, stored, reference, token } = await correctableOrder()
    for (let attempt = 0; attempt < RATE_LIMITS.orderChange.max; attempt++) await cancelOrder(deps, headers, "faketoken-guess")

    const result = await cancelOrder(deps, headers, token)

    expect(result).toMatchObject({ status: "limited", retryAfterMinutes: expect.any(Number) })
    expect((await stored(reference)).status).toBe("failed_correctable")
    expect((await payment(reference)).status).toBe("held")
  })

  it("tells the customer to try again when the money or the email fails, logging the kind of error and never its message", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const { deps, stored, reference, token } = await correctableOrder()
    jest.spyOn(deps.mailer, "send").mockRejectedValue(new Error("Resend refused customer@example.test"))

    expect(await cancelOrder(deps, headers, token)).toEqual({ status: "failed" })

    expect((await stored(reference)).status).toBe("failed_correctable")
    const logged = error.mock.calls.flat().join(" ")
    expect(logged).toContain("Error")
    expect(logged).not.toContain("customer@example.test")
    for (const code of CODES) expect(logged).not.toContain(code)
    error.mockRestore()
  })
})
