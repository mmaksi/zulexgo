import type { Clock } from "@/src/core/ports/clock"
import type { RateLimit, RateLimitDecision, RateLimiter } from "@/src/core/ports/rate-limiter"

/** Counts in this process only: right for dev and tests, and worthless across Vercel instances. */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; attempts: number }>()

  constructor(private readonly clock: Clock) {}

  async consume(key: string, { max, windowMs }: RateLimit): Promise<RateLimitDecision> {
    const now = this.clock.now().getTime()
    const current = this.windows.get(key)
    const window = current && now < current.startedAt + windowMs ? current : { startedAt: now, attempts: 0 }
    window.attempts += 1
    this.windows.set(key, window)

    return window.attempts <= max ? { allowed: true } : { allowed: false, retryAfterMs: window.startedAt + windowMs - now }
  }
}
