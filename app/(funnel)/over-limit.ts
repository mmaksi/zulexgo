import type { RateLimit } from "@/src/core/ports/rate-limit/rate-limiter"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { clientAddress } from "@/src/lib/client-address"

const MINUTE = 60_000

/**
 * Counts one attempt at `action` against the caller's address, before anything is read or opened, so
 * an address over its limit costs the registration service and the payment provider nothing. Returns
 * how long the caller must wait, or `undefined` when the attempt may go ahead. Every attempt counts,
 * invalid ones too: a funnel's server action is reachable by any POST.
 */
export async function overLimit(
  deps: Pick<Dependencies, "rateLimiter">,
  headers: Headers,
  action: string,
  limit: RateLimit,
): Promise<{ retryAfterMinutes: number } | undefined> {
  const attempt = await deps.rateLimiter.consume(`${action}:${clientAddress(headers)}`, limit)
  return attempt.allowed ? undefined : { retryAfterMinutes: Math.ceil(attempt.retryAfterMs / MINUTE) }
}
