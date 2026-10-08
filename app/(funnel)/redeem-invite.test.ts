import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { setupFlow } from "@/tests/integration/flow-harness"
import { redeemInvite } from "./redeem-invite"

const from = (address: string) => new Headers({ "x-forwarded-for": address })

function setup() {
  const flow = setupFlow()
  const deps = { ...flow.deps, beta: { invites: { newRegistration: ["K7M2-QX9P"] }, dailyPlaces: 5 } }
  return { ...flow, deps }
}

describe("redeeming an invite code", () => {
  it("accepts a code of the service, however it was typed, and hands back the code as it is kept", async () => {
    const { deps } = setup()

    expect(await redeemInvite(deps, from("203.0.113.7"), "newRegistration", " k7m2-qx9p ")).toEqual({ status: "accepted", invite: "K7M2-QX9P" })
  })

  it.each(["", "WRONG-CODE", "K7M2-QX9P-no", 42, undefined])("refuses %p", async (code) => {
    const { deps } = setup()

    expect(await redeemInvite(deps, from("203.0.113.7"), "newRegistration", code)).toEqual({ status: "refused" })
  })

  it("refuses a service that is not in beta, so no code is ever kept for one", async () => {
    const { deps } = setup()

    expect(await redeemInvite(deps, from("203.0.113.7"), "deregistration", "K7M2-QX9P")).toEqual({ status: "refused" })
  })

  it("counts every attempt, so an address cannot try codes in bulk, and then refuses even the right code", async () => {
    const { deps } = setup()
    const { max } = RATE_LIMITS.inviteAttempt

    for (let attempt = 0; attempt < max; attempt++) await redeemInvite(deps, from("203.0.113.7"), "newRegistration", `guess-${attempt}`)

    expect(await redeemInvite(deps, from("203.0.113.7"), "newRegistration", "K7M2-QX9P")).toEqual({ status: "limited", retryAfterMinutes: 60 })
  })

  it("counts each address on its own, and lets one try again once its window has passed", async () => {
    const { deps, clock } = setup()
    for (let attempt = 0; attempt <= RATE_LIMITS.inviteAttempt.max; attempt++) await redeemInvite(deps, from("203.0.113.7"), "newRegistration", "x")

    expect(await redeemInvite(deps, from("198.51.100.9"), "newRegistration", "K7M2-QX9P")).toMatchObject({ status: "accepted" })
    clock.advance(RATE_LIMITS.inviteAttempt.windowMs)
    expect(await redeemInvite(deps, from("203.0.113.7"), "newRegistration", "K7M2-QX9P")).toMatchObject({ status: "accepted" })
  })

  it("is unavailable, never open, when the limiter cannot answer, and logs the kind of error only", async () => {
    const { deps } = setup()
    jest.spyOn(deps.rateLimiter, "consume").mockRejectedValue(new Error("connection string with a secret"))
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined)

    expect(await redeemInvite(deps, from("203.0.113.7"), "newRegistration", "K7M2-QX9P")).toEqual({ status: "unavailable" })

    expect(log).toHaveBeenCalledWith(expect.stringContaining("Error"))
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|K7M2/)
    log.mockRestore()
  })
})
