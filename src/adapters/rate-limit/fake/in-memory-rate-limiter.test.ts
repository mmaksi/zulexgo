import type { Clock } from "@/src/core/ports/clock"
import { rateLimiterContract } from "@/src/core/ports/rate-limiter.contract"
import { InMemoryRateLimiter } from "./in-memory-rate-limiter"

/** Adapters may not import each other, so this test keeps its own movable clock. */
rateLimiterContract("InMemoryRateLimiter", () => {
  let now = new Date("2026-03-01T09:00:00.000Z").getTime()
  const clock: Clock = { now: () => new Date(now) }
  return { limiter: new InMemoryRateLimiter(clock), advance: (milliseconds) => (now += milliseconds) }
})
