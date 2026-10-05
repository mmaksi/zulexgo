import { isInBeta, mayOrder } from "@/src/core/domain/application/beta"
import type { OrderableService } from "@/src/core/domain/application/service"
import { BetaFull } from "@/src/core/errors/application/beta-full"
import { InviteRequired } from "@/src/core/errors/application/invite-required"
import { MAX_WINDOW_MS } from "@/src/core/ports/rate-limit/rate-limiter"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

/** `InviteRequired` unless `invite` opens `service`: a service outside the beta needs none. Counts nothing. */
export function requireInvite(deps: Pick<Dependencies, "beta">, service: OrderableService, invite: unknown): void {
  if (!mayOrder(deps.beta, service, invite)) throw new InviteRequired()
}

/**
 * Takes one of the day's places in `service`'s beta, or `BetaFull`. A day is the limiter's longest
 * window, counted from the first place taken. Called once the order is known to be valid, so a form
 * the customer has to correct costs no place; a place is spent when a payment is opened, paid or not.
 */
export async function takeBetaPlace(deps: Pick<Dependencies, "beta" | "rateLimiter">, service: OrderableService): Promise<void> {
  if (!isInBeta(deps.beta, service)) return
  const place = await deps.rateLimiter.consume(`beta-places:${service}`, { max: deps.beta.dailyPlaces, windowMs: MAX_WINDOW_MS })
  if (!place.allowed) throw new BetaFull()
}
