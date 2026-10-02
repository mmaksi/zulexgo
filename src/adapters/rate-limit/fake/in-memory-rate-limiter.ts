import type { Clock } from "@/src/core/ports/clock"
import { MAX_WINDOW_MS, type RateLimit, type RateLimitDecision, type RateLimiter } from "@/src/core/ports/rate-limiter"

/**
 * Counts in this process only: right for dev and tests, and worthless across Vercel instances.
 * The container wires it only while the repository is the in-memory one, so production, which
 * refuses that repository, never gets it; `PostgresRateLimiter` is the shared-storage adapter.
 * Time comes from the injected `Clock`, so a test moves a window with a fake clock instead of
 * sleeping. Keys are kept as given (nothing is persisted, so nothing is hashed), and a window
 * is replaced rather than evicted: entries live as long as the process.
 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { startedAt: number; attempts: number }>()

  constructor(private readonly clock: Clock) {}

  /**
   * Fixed window per key, as `RateLimiter` describes. A refused attempt is still counted but
   * leaves `startedAt` alone, so refusals never lengthen the window.
   */
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
