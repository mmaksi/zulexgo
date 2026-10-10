import { failedBecause } from "@/app/(funnel)/failed-because"
import { overLimit } from "@/app/(funnel)/over-limit"
import { isInBeta, mayOrder, normaliseInvite } from "@/src/core/domain/application/beta"
import type { OrderableService } from "@/src/core/domain/application/service"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

export type RedeemResult =
  | { status: "accepted"; invite: string }
  | { status: "refused" }
  | { status: "limited"; retryAfterMinutes: number }
  | { status: "unavailable" }

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
