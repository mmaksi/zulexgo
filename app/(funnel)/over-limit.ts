import type { RateLimit } from "@/src/core/ports/rate-limit/rate-limiter"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { clientAddress } from "@/src/lib/client-address"

const MINUTE = 60_000

export async function overLimit(
  deps: Pick<Dependencies, "rateLimiter">,
  headers: Headers,
  action: string,
  limit: RateLimit,
): Promise<{ retryAfterMinutes: number } | undefined> {
  const attempt = await deps.rateLimiter.consume(`${action}:${clientAddress(headers)}`, limit)
  return attempt.allowed ? undefined : { retryAfterMinutes: Math.ceil(attempt.retryAfterMs / MINUTE) }
}
