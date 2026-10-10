import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { RateLimiter } from "@/src/core/ports/rate-limit/rate-limiter"
import { getStatusByToken, type StatusView } from "@/src/core/use-cases/status/get-status-by-token"
import { clientAddress } from "@/src/lib/client-address"

export type StatusLookup =
  | { kind: "found"; view: StatusView }
  | { kind: "invalid" }
  | { kind: "limited"; retryAfterSeconds: number }

export async function lookupStatus(
  deps: Parameters<typeof getStatusByToken>[0] & { rateLimiter: RateLimiter },
  headers: Headers,
  token: string,
): Promise<StatusLookup> {
  const attempt = await deps.rateLimiter.consume(`status-lookup:${clientAddress(headers)}`, RATE_LIMITS.statusLookup)
  if (!attempt.allowed) return { kind: "limited", retryAfterSeconds: Math.ceil(attempt.retryAfterMs / 1000) }

  try {
    return { kind: "found", view: await getStatusByToken(deps, token) }
  } catch (error) {
    if (error instanceof TokenInvalid) return { kind: "invalid" }
    throw error
  }
}
