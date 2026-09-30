import { createHmac } from "node:crypto"
import { Pool } from "pg"
import type { Clock } from "@/src/core/ports/clock"
import { MAX_WINDOW_MS, type RateLimit, type RateLimitDecision, type RateLimiter } from "@/src/core/ports/rate-limiter"

/** One statement, so concurrent attempts queue on the row: each sees the count the last one left. */
const COUNT_ATTEMPT = `
  INSERT INTO rate_limits AS r (key_hash, window_started_at, attempts)
  VALUES ($1, $2, 1)
  ON CONFLICT (key_hash) DO UPDATE SET
    window_started_at = CASE WHEN r.window_started_at + make_interval(secs => $3::double precision / 1000) <= $2
                             THEN $2 ELSE r.window_started_at END,
    attempts = CASE WHEN r.window_started_at + make_interval(secs => $3::double precision / 1000) <= $2
                    THEN 1 ELSE r.attempts + 1 END
  RETURNING window_started_at, attempts`

const PURGE_EVERY_MS = 60 * 60_000

/**
 * `RateLimiter` on the application database, so every Vercel instance counts
 * into the same rows. Keys carry addresses and emails, so only an HMAC of a
 * key is stored. Server-side only, through the transaction pooler: the query
 * is unnamed. Once an hour per instance it forgets the counts of windows that
 * began more than a day ago, which no window can still cover, so the table
 * holds only recent callers.
 */
export class PostgresRateLimiter implements RateLimiter {
  private readonly pool: Pool
  private readonly secret: string
  private readonly clock: Clock
  private lastPurgeAt = 0

  constructor(options: { connectionString: string; secret: string; clock: Clock }) {
    this.pool = new Pool({ connectionString: options.connectionString, allowExitOnIdle: true })
    // An idle connection dropped by the pooler must not crash the process; the next query reconnects.
    this.pool.on("error", (error) => console.error(`Postgres connection lost: ${error.message}`))
    this.secret = options.secret
    this.clock = options.clock
  }

  async consume(key: string, { max, windowMs }: RateLimit): Promise<RateLimitDecision> {
    if (windowMs > MAX_WINDOW_MS) throw new RangeError(`A rate limit window is at most ${MAX_WINDOW_MS} ms`)
    const now = this.clock.now()
    await this.purgeOldWindows(now)
    const keyHash = createHmac("sha256", this.secret).update(key).digest("base64url")
    const { rows } = await this.pool.query<{ window_started_at: Date; attempts: number }>(COUNT_ATTEMPT, [keyHash, now, windowMs])
    const { window_started_at: startedAt, attempts } = rows[0]

    return attempts <= max ? { allowed: true } : { allowed: false, retryAfterMs: startedAt.getTime() + windowMs - now.getTime() }
  }

  private async purgeOldWindows(now: Date): Promise<void> {
    if (now.getTime() - this.lastPurgeAt < PURGE_EVERY_MS) return
    this.lastPurgeAt = now.getTime()
    await this.pool.query("DELETE FROM rate_limits WHERE window_started_at < $1", [new Date(now.getTime() - MAX_WINDOW_MS)])
  }
}
