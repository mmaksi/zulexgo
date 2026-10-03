import { anApplication } from "@/tests/fixtures/applications"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import type { RateLimit, RateLimitDecision } from "@/src/core/ports/rate-limit/rate-limiter"
import { lookupStatus } from "./lookup"

const TOKEN = "faketoken-lookup"
const application = anApplication({ status: "submitted_to_kba" })

const consumer = (decision: RateLimitDecision) => jest.fn<Promise<RateLimitDecision>, [string, RateLimit]>(async () => decision)
const consumeAllowing = () => consumer({ allowed: true })

function setup(rateLimiter: { consume: ReturnType<typeof consumeAllowing> } = { consume: consumeAllowing() }) {
  const deps = {
    repository: { findByStatusToken: async (token: string) => (token === TOKEN ? application : undefined) },
    documents: { list: async () => [] },
    payments: { getPayment: async () => Promise.reject(new Error("only ended orders ask the provider")) },
    rateLimiter,
  }
  return { deps, rateLimiter }
}

const from = (address: string) => new Headers({ "x-forwarded-for": address })

describe("lookupStatus", () => {
  it("finds the order behind a link", async () => {
    const result = await lookupStatus(setup().deps, from("203.0.113.7"), TOKEN)

    expect(result).toMatchObject({ kind: "found", view: { reference: application.reference } })
  })

  it("answers an unknown link with 'invalid', which the page shows as the one neutral error", async () => {
    expect(await lookupStatus(setup().deps, from("203.0.113.7"), "faketoken-unknown")).toEqual({ kind: "invalid" })
  })

  it("counts every lookup, right link or wrong, against the caller's address", async () => {
    const { deps, rateLimiter } = setup()

    await lookupStatus(deps, from("203.0.113.7"), TOKEN)
    await lookupStatus(deps, from("198.51.100.9"), "faketoken-guess")

    expect(rateLimiter.consume.mock.calls).toEqual([
      ["status-lookup:203.0.113.7", RATE_LIMITS.statusLookup],
      ["status-lookup:198.51.100.9", RATE_LIMITS.statusLookup],
    ])
  })

  it("looks nothing up once the address is over its limit, and says how long to wait", async () => {
    const findByStatusToken = jest.fn(async () => application)
    const { deps } = setup({ consume: consumer({ allowed: false, retryAfterMs: 42_500 }) })

    const result = await lookupStatus({ ...deps, repository: { findByStatusToken } }, from("203.0.113.7"), TOKEN)

    expect(result).toEqual({ kind: "limited", retryAfterSeconds: 43 })
    expect(findByStatusToken).not.toHaveBeenCalled()
  })
})
