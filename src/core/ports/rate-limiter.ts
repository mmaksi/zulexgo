/** Adapters may forget a count a day after its window began, so no window may be longer. */
export const MAX_WINDOW_MS = 24 * 60 * 60_000

export interface RateLimit {
  /** Attempts allowed per window. */
  readonly max: number
  readonly windowMs: number
}

export type RateLimitDecision =
  | { readonly allowed: true }
  /** How long until the window ends and the key may try again. */
  | { readonly allowed: false; readonly retryAfterMs: number }

/**
 * Counts attempts against a key (an address, a status link, an order) so that
 * anything guessable or mailable is bounded. Vercel runs many instances, so a
 * limiter that counts in one process's memory limits nothing: adapters used
 * outside dev keep their counts in shared storage.
 *
 * Guarantees every adapter must honour:
 * - Fixed window: the first `max` attempts under a key are allowed and the
 *   rest refused, until `windowMs` after the first attempt; then counting
 *   starts over.
 * - A refused attempt reports the time left in the window and never lengthens it.
 * - Keys count separately.
 * - Attempts made at the same moment never allow more than `max` in all.
 * - A window longer than `MAX_WINDOW_MS` is a `RangeError`.
 * - A key is opaque and may hold an address or an email: an adapter that
 *   persists it stores a keyed hash, never the key.
 */
export interface RateLimiter {
  consume(key: string, limit: RateLimit): Promise<RateLimitDecision>
}
