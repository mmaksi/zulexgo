import { failedBecause } from "@/app/(funnel)/failed-because"
import { overLimit } from "@/app/(funnel)/over-limit"
import type { StartCheckoutResult } from "@/app/(funnel)/_components/checkout-panel"
import { toRequest } from "@/app/_components/vehicle-data"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { BetaFull } from "@/src/core/errors/application/beta-full"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"
import { InviteRequired } from "@/src/core/errors/application/invite-required"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkEligibility } from "@/src/core/use-cases/checkout/check-eligibility"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import type { CheckoutActions } from "./_components/checkout-actions"

export async function checkPrefix(
  deps: Pick<Dependencies, "registration" | "rateLimiter">,
  headers: Headers,
  prefix: string,
): ReturnType<CheckoutActions["checkEligibility"]> {
  try {
    const over = await overLimit(deps, headers, "deregister-eligibility", RATE_LIMITS.eligibilityLookup)
    if (over) return { ok: false, reason: "limited", ...over }

    return { ok: true, ...(await checkEligibility(deps, prefix)) }
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, reason: "invalidPrefix" }
    failedBecause("eligibility check", error)
    return { ok: false, reason: "unavailable" }
  }
}

export async function startDeregistrationCheckout(
  deps: Dependencies,
  headers: Headers,
  { plateCount, vehicle, consents, acknowledgedDuplicate }: Parameters<CheckoutActions["startCheckout"]>[0],
  invite?: string,
): Promise<StartCheckoutResult> {
  try {
    const over = await overLimit(deps, headers, "deregister-checkout", RATE_LIMITS.checkout)
    if (over) return { ok: false, reason: "limited", ...over }

    const { reference, clientSecret } = await submitCheckout(deps, {
      service: "deregistration",
      request: toRequest(vehicle, plateCount),
      email: vehicle.email,
      consents,
      invite,
      acknowledgedDuplicate: acknowledgedDuplicate === true,
    })
    return { ok: true, reference, clientSecret }
  } catch (error) {
    if (error instanceof ConsentRequired) return { ok: false, reason: "consent" }
    if (error instanceof ValidationError) return { ok: false, reason: "invalid" }
    if (error instanceof OpenApplicationExists) return { ok: false, reason: "duplicate" }
    if (error instanceof InviteRequired) return { ok: false, reason: "invite" }
    if (error instanceof BetaFull) return { ok: false, reason: "full" }
    failedBecause("checkout", error)
    return { ok: false, reason: "unavailable" }
  }
}
