import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { InMemoryRateLimiter } from "@/src/adapters/rate-limit/fake/in-memory-rate-limiter"
import type { Beta } from "@/src/core/domain/application/beta"
import { BetaFull } from "@/src/core/errors/application/beta-full"
import { InviteRequired } from "@/src/core/errors/application/invite-required"
import { requireInvite, takeBetaPlace } from "@/src/core/use-cases/checkout/beta-access"

const DAY = 24 * 60 * 60_000
const beta: Beta = { invites: { newRegistration: ["K7M2-QX9P"] }, dailyPlaces: 2 }

function setup(withBeta: Beta | null = beta) {
  const clock = new FakeClock()
  const rateLimiter = new InMemoryRateLimiter(clock)
  return { deps: { beta: withBeta ?? undefined, rateLimiter }, clock, rateLimiter }
}

describe("requireInvite", () => {
  it("lets a holder of the service's code in", () => {
    expect(() => requireInvite(setup().deps, "newRegistration", "k7m2-qx9p")).not.toThrow()
  })

  it.each([undefined, "", "K7M2-QX9P-no", 3])("turns %p away from a service in beta", (invite) => {
    expect(() => requireInvite(setup().deps, "newRegistration", invite)).toThrow(InviteRequired)
  })

  it("asks nothing of anyone for a service outside the beta, or when there is no beta at all", () => {
    expect(() => requireInvite(setup().deps, "deregistration", undefined)).not.toThrow()
    expect(() => requireInvite(setup(null).deps, "newRegistration", undefined)).not.toThrow()
  })
})

describe("takeBetaPlace", () => {
  it("takes places up to the day's number, then refuses", async () => {
    const { deps } = setup()

    await takeBetaPlace(deps, "newRegistration")
    await takeBetaPlace(deps, "newRegistration")

    await expect(takeBetaPlace(deps, "newRegistration")).rejects.toBeInstanceOf(BetaFull)
  })

  it("gives the places back a day after the first was taken", async () => {
    const { deps, clock } = setup()
    await takeBetaPlace(deps, "newRegistration")
    await takeBetaPlace(deps, "newRegistration")

    clock.advance(DAY)

    await expect(takeBetaPlace(deps, "newRegistration")).resolves.toBeUndefined()
  })

  it("counts each service's places apart", async () => {
    const both: Beta = { invites: { newRegistration: ["K7M2-QX9P"], deregistration: ["DEREG-0001"] }, dailyPlaces: 1 }
    const { deps } = setup(both)
    await takeBetaPlace(deps, "newRegistration")

    await expect(takeBetaPlace(deps, "deregistration")).resolves.toBeUndefined()
  })

  it("takes no place for a service outside the beta, so a public service is never counted", async () => {
    const { deps, rateLimiter } = setup()
    const consume = jest.spyOn(rateLimiter, "consume")

    for (let order = 0; order < 10; order++) await takeBetaPlace(deps, "deregistration")

    expect(consume).not.toHaveBeenCalled()
  })
})
