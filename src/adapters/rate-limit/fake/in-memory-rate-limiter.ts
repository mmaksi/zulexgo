import type { Clock } from "@/src/core/ports/clock/clock"
import { MAX_WINDOW_MS, type RateLimit, type RateLimitDecision, type RateLimiter } from "@/src/core/ports/rate-limit/rate-limiter"

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; attempts: number }>()

  constructor(private readonly clock: Clock) {}

  async consume(key: string, { max, windowMs }: RateLimit): Promise<RateLimitDecision> {
    if (windowMs > MAX_WINDOW_MS) throw new RangeError(`A rate limit window is at most ${MAX_WINDOW_MS} ms`)
    // No await between reading and writing the count, so simultaneous attempts cannot exceed max.
    const now = this.clock.now().getTime()
    const current = this.windows.get(key)
    const window = current && now < current.startedAt + windowMs ? current : { startedAt: now, attempts: 0 }
    window.attempts += 1
    this.windows.set(key, window)

    return window.attempts <= max ? { allowed: true } : { allowed: false, retryAfterMs: window.startedAt + windowMs - now }
  }
}
