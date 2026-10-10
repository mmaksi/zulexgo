import { isInBeta, mayOrder } from "@/src/core/domain/application/beta"
import type { OrderableService } from "@/src/core/domain/application/service"
import { BetaFull } from "@/src/core/errors/application/beta-full"
import { InviteRequired } from "@/src/core/errors/application/invite-required"
import { MAX_WINDOW_MS } from "@/src/core/ports/rate-limit/rate-limiter"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

export function requireInvite(deps: Pick<Dependencies, "beta">, service: OrderableService, invite: unknown): void {
  if (!mayOrder(deps.beta, service, invite)) throw new InviteRequired()
}

export async function takeBetaPlace(deps: Pick<Dependencies, "beta" | "rateLimiter">, service: OrderableService): Promise<void> {
  if (!isInBeta(deps.beta, service)) return
  const place = await deps.rateLimiter.consume(`beta-places:${service}`, { max: deps.beta.dailyPlaces, windowMs: MAX_WINDOW_MS })
  if (!place.allowed) throw new BetaFull()
}
