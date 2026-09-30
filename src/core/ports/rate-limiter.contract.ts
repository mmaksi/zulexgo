import type { RateLimit, RateLimiter } from "./rate-limiter"

const SECOND = 1_000
const THREE_PER_MINUTE: RateLimit = { max: 3, windowMs: 60 * SECOND }

/** A limiter and the way to move the time it counts by; adapters may not share a fake clock, so each test supplies its own. */
export interface RateLimiterSubject {
  limiter: RateLimiter
  advance(milliseconds: number): void
}

/** Every RateLimiter adapter must pass this, including the fake. */
export function rateLimiterContract(name: string, makeSubject: () => RateLimiterSubject) {
  describe(`RateLimiter contract: ${name}`, () => {
    let subject: RateLimiterSubject
    let limiter: RateLimiter
    let sequence = 0
    const newKey = () => `contract-key-${(sequence += 1)}`
    const clock = { advance: (milliseconds: number) => subject.advance(milliseconds) }

    beforeEach(() => {
      subject = makeSubject()
      limiter = subject.limiter
    })

    const attempts = async (key: string, count: number, limit = THREE_PER_MINUTE) => {
      const decisions = []
      for (let attempt = 0; attempt < count; attempt += 1) decisions.push(await limiter.consume(key, limit))
      return decisions.map((decision) => decision.allowed)
    }

    it("allows the first attempts up to the limit and refuses the rest", async () => {
      expect(await attempts(newKey(), 5)).toEqual([true, true, true, false, false])
    })

    it("tells a refused attempt how long is left in the window", async () => {
      const key = newKey()
      await attempts(key, 3)
      clock.advance(20 * SECOND)

      expect(await limiter.consume(key, THREE_PER_MINUTE)).toEqual({ allowed: false, retryAfterMs: 40 * SECOND })
    })

    it("starts counting again once the window has ended", async () => {
      const key = newKey()
      await attempts(key, 4)

      clock.advance(THREE_PER_MINUTE.windowMs)

      expect(await attempts(key, 4)).toEqual([true, true, true, false])
    })

    it("does not let refused attempts lengthen the window", async () => {
      const key = newKey()
      await attempts(key, 3)
      for (let second = 0; second < 5; second += 1) {
        clock.advance(10 * SECOND)
        await limiter.consume(key, THREE_PER_MINUTE)
      }

      clock.advance(10 * SECOND)

      expect((await limiter.consume(key, THREE_PER_MINUTE)).allowed).toBe(true)
    })

    it("refuses a window longer than a day, which an adapter may already have purged", async () => {
      await expect(limiter.consume(newKey(), { max: 1, windowMs: 25 * 60 * 60_000 })).rejects.toThrow(RangeError)
    })

    it("counts each key on its own", async () => {
      const [first, second] = [newKey(), newKey()]
      await attempts(first, 3)

      expect(await attempts(first, 1)).toEqual([false])
      expect(await attempts(second, 3)).toEqual([true, true, true])
    })

    it("never allows more than the limit when attempts arrive together", async () => {
      const key = newKey()

      const decisions = await Promise.all(Array.from({ length: 12 }, () => limiter.consume(key, THREE_PER_MINUTE)))

      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(3)
    })
  })
}
