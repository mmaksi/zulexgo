import { validateField } from "@/app/_components/vehicle-data"
import type { CorrectionInput } from "@/src/core/domain/correction"
import { RATE_LIMITS } from "@/src/core/domain/rate-limits"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import { InvalidTransition } from "@/src/core/errors/invalid-transition"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import { ValidationError } from "@/src/core/errors/validation-error"
import { cancelApplication } from "@/src/core/use-cases/cancel-application"
import { correctApplication } from "@/src/core/use-cases/correct-application"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { clientAddress } from "@/src/lib/client-address"
import type { CorrectionField, OrderChangeState } from "./order-change-state"

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

const FIELDS: CorrectionField[] = ["vin", "rearPlate", "frontPlate", "certificate"]

/** Any POST can reach this, so only text in the four known fields gets through; anything else reads as blank. */
function toInput(raw: unknown): CorrectionInput {
  const given = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(FIELDS.map((field) => [field, typeof given[field] === "string" ? given[field] : undefined]))
}

/** The funnel's own wording for each wrong field, taken from the value that was sent, which is never sent back. */
function invalid(error: ValidationError, input: CorrectionInput): OrderChangeState {
  const errors: Partial<Record<CorrectionField, string>> = {}
  for (const field of FIELDS) {
    if (error.fields.includes(field)) errors[field] = validateField(field, input[field] ?? "") ?? "Bitte prüfen Sie diese Angabe."
  }
  return error.fields.includes("correction")
    ? { status: "invalid", errors, general: "Bitte ändern Sie mindestens eine Angabe." }
    : { status: "invalid", errors }
}

export async function correctOrder(deps: Dependencies, headers: Headers, token: string, raw: unknown): Promise<OrderChangeState> {
  const over = await limited(deps, headers)
  if (over) return over

  const input = toInput(raw)
  try {
    return (await correctApplication(deps, token, input)) === "resubmitted" ? { status: "done" } : { status: "refused" }
  } catch (error) {
    if (error instanceof TokenInvalid || error instanceof InvalidTransition) return { status: "notPossible" }
    if (error instanceof ValidationError) return invalid(error, input)
    if (error instanceof GatewayUnavailable) return { status: "unavailable" }
    // By name only: the message may hold an address or a code.
    console.error(`[correct] failed: ${error instanceof Error ? error.name : "unknown error"}`)
    return { status: "failed" }
  }
}
