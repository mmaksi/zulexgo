import { RATE_LIMITS } from "@/src/core/domain/rate-limits"
import { InvalidTransition } from "@/src/core/errors/invalid-transition"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import { cancelApplication } from "@/src/core/use-cases/cancel-application"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { clientAddress } from "@/src/lib/client-address"
import type { OrderChangeState } from "./order-change-state"

const MINUTE = 60_000

/**
 * Counted before anything is read, whatever the link, so guessing links through
 * this door is bounded like the page itself; an address over its limit moves no money.
 */
async function limited(deps: Pick<Dependencies, "rateLimiter">, headers: Headers): Promise<OrderChangeState | undefined> {
  const attempt = await deps.rateLimiter.consume(`order-change:${clientAddress(headers)}`, RATE_LIMITS.orderChange)
  return attempt.allowed ? undefined : { status: "limited", retryAfterMinutes: Math.ceil(attempt.retryAfterMs / MINUTE) }
}

/** An unknown link and an order that cannot be cancelled get one answer, so neither is told apart from outside. */
export async function cancelOrder(deps: Dependencies, headers: Headers, token: string): Promise<OrderChangeState> {
  const over = await limited(deps, headers)
  if (over) return over

  try {
    await cancelApplication(deps, token)
    return { status: "done" }
  } catch (error) {
    if (error instanceof TokenInvalid || error instanceof InvalidTransition) return { status: "notPossible" }
    // By name only: the message may hold an address the mailer refused.
    console.error(`[cancel] failed: ${error instanceof Error ? error.name : "unknown error"}`)
    return { status: "failed" }
  }
}
