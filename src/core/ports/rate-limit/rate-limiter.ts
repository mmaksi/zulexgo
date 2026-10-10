export const MAX_WINDOW_MS = 24 * 60 * 60_000

export interface RateLimit {
  readonly max: number
  readonly windowMs: number
}

export type RateLimitDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterMs: number }

// Vercel runs many instances: outside dev, counts live in shared storage, not process memory.
// A key may hold an address or an email: an adapter that persists it stores a keyed hash.
export interface RateLimiter {
  consume(key: string, limit: RateLimit): Promise<RateLimitDecision>
}
