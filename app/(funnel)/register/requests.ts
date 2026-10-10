import { failedBecause } from "@/app/(funnel)/failed-because"
import { overLimit } from "@/app/(funnel)/over-limit"
import type { StartCheckoutResult } from "@/app/(funnel)/_components/checkout-panel"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { BetaFull } from "@/src/core/errors/application/beta-full"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"
import { InviteRequired } from "@/src/core/errors/application/invite-required"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkRegistrationEligibility } from "@/src/core/use-cases/checkout/check-registration-eligibility"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import type { RegistrationActions } from "./_components/registration-actions"
import { toRequest } from "./_components/registration-data"

export async function checkPostcode(
  deps: Pick<Dependencies, "registration" | "rateLimiter">,
  headers: Headers,
  postcode: string,
): ReturnType<RegistrationActions["checkEligibility"]> {
  try {
    const over = await overLimit(deps, headers, "register-eligibility", RATE_LIMITS.eligibilityLookup)
    if (over) return { ok: false, reason: "limited", ...over }

    return { ok: true, ...(await checkRegistrationEligibility(deps, postcode)) }
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, reason: "invalidPostcode" }
    failedBecause("postcode check", error)
    return { ok: false, reason: "unavailable" }
  }
}

export async function startRegistrationCheckout(
  deps: Dependencies,
  headers: Headers,
  { data, consents, acknowledgedDuplicate }: Parameters<RegistrationActions["startCheckout"]>[0],
  invite?: string,
): Promise<StartCheckoutResult> {
  try {
    const over = await overLimit(deps, headers, "register-checkout", RATE_LIMITS.checkout)
    if (over) return { ok: false, reason: "limited", ...over }

    const { reference, clientSecret } = await submitCheckout(deps, {
      service: "newRegistration",
      request: toRequest(data),
      email: data.email,
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
