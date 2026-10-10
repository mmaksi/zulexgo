import { MESSAGES as NEW_REGISTRATION_MESSAGES } from "@/app/(funnel)/register/_components/registration-data"
import { validateField } from "@/app/_components/vehicle-data"
import type { OrderCorrectionInput } from "@/src/core/domain/application/correction"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"
import { PaymentNoLongerWhole } from "@/src/core/errors/payment/payment-no-longer-whole"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import { ValidationError } from "@/src/core/errors/validation-error"
import { cancelApplication } from "@/src/core/use-cases/application/cancel-application"
import { correctApplication } from "@/src/core/use-cases/application/correct-application"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { clientAddress } from "@/src/lib/client-address"
import type { CorrectionField, OrderChangeState } from "./order-change-state"

const MINUTE = 60_000

async function limited(deps: Pick<Dependencies, "rateLimiter">, headers: Headers): Promise<OrderChangeState | undefined> {
  const attempt = await deps.rateLimiter.consume(`order-change:${clientAddress(headers)}`, RATE_LIMITS.orderChange)
  return attempt.allowed ? undefined : { status: "limited", retryAfterMinutes: Math.ceil(attempt.retryAfterMs / MINUTE) }
}

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

const DEREGISTRATION_FIELDS = ["vin", "rearPlate", "frontPlate", "certificate"] as const
const NEW_REGISTRATION_FIELDS = ["evbNumber", "part2Number", "part2SecurityCode", "firstName", "lastName", "birthDate"] as const
const FIELDS: CorrectionField[] = [...DEREGISTRATION_FIELDS, ...NEW_REGISTRATION_FIELDS]

function toInput(raw: unknown): OrderCorrectionInput {
  const given = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(FIELDS.map((field) => [field, typeof given[field] === "string" ? given[field] : undefined]))
}

function wordingFor(field: CorrectionField, value: string): string {
  if ((NEW_REGISTRATION_FIELDS as readonly string[]).includes(field)) return NEW_REGISTRATION_MESSAGES[field as (typeof NEW_REGISTRATION_FIELDS)[number]]
  return validateField(field as (typeof DEREGISTRATION_FIELDS)[number], value) ?? "Bitte prüfen Sie diese Angabe."
}

function invalid(error: ValidationError, input: OrderCorrectionInput): OrderChangeState {
  const errors: Partial<Record<CorrectionField, string>> = {}
  for (const field of FIELDS) {
    if (error.fields.includes(field)) errors[field] = wordingFor(field, input[field] ?? "")
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
    if (error instanceof TokenInvalid || error instanceof InvalidTransition || error instanceof PaymentNoLongerWhole) return { status: "notPossible" }
    if (error instanceof ValidationError) return invalid(error, input)
    if (error instanceof GatewayUnavailable) return { status: "unavailable" }
    // By name only: the message may hold an address or a code.
    console.error(`[correct] failed: ${error instanceof Error ? error.name : "unknown error"}`)
    return { status: "failed" }
  }
}
