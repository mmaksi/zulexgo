import { failedBecause } from "@/app/(funnel)/failed-because"
import { overLimit } from "@/app/(funnel)/over-limit"
import { isInBeta, mayOrder, normaliseInvite } from "@/src/core/domain/application/beta"
import type { OrderableService } from "@/src/core/domain/application/service"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

export type RedeemResult =
  /** The code as it is kept, which the browser holds from now on and checkout checks again. */
  | { status: "accepted"; invite: string }
  | { status: "refused" }
  /** The address tried too many codes: it may try again after `retryAfterMinutes`. */
  | { status: "limited"; retryAfterMinutes: number }
  | { status: "unavailable" }

/**
 * A visitor types the invite code of a service in beta. Reachable by any POST, so every attempt is counted
 * against the caller's address before the code is read, right ones too: an address over its limit learns
 * nothing about any code, and a limiter that cannot answer refuses (fails closed). The code is never logged.
 * Only a service in beta has codes to redeem.
 */
export async function redeemInvite(
  deps: Pick<Dependencies, "beta" | "rateLimiter">,
  headers: Headers,
  service: OrderableService,
  code: unknown,
): Promise<RedeemResult> {
  try {
    const over = await overLimit(deps, headers, `invite-${service}`, RATE_LIMITS.inviteAttempt)
    if (over) return { status: "limited", ...over }

    if (!isInBeta(deps.beta, service) || !mayOrder(deps.beta, service, code)) return { status: "refused" }
    return { status: "accepted", invite: normaliseInvite(code) }
  } catch (error) {
    failedBecause("invite redemption", error)
    return { status: "unavailable" }
  }
}
