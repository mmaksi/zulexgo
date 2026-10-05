import { failedBecause } from "@/app/(funnel)/failed-because"
import { overLimit } from "@/app/(funnel)/over-limit"
import type { StartCheckoutResult } from "@/app/(funnel)/_components/checkout-panel"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkRegistrationEligibility } from "@/src/core/use-cases/checkout/check-registration-eligibility"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import type { RegistrationActions } from "./_components/registration-actions"
import { toRequest } from "./_components/registration-data"

/**
 * What the Neuzulassung funnel's server actions do. Reachable by any POST, so each call is counted
 * against the caller's address first (an address over its limit moves nothing, and so does a limiter that
 * cannot answer: it fails closed, as unavailable), and every input is
 * treated as untrusted and validated by the use case. Failures are logged by name only: the input holds
 * an IBAN, a birth date and the codes of the car's papers.
 */

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
): Promise<StartCheckoutResult> {
  try {
    const over = await overLimit(deps, headers, "register-checkout", RATE_LIMITS.checkout)
    if (over) return { ok: false, reason: "limited", ...over }

    const { reference, clientSecret } = await submitCheckout(deps, {
      service: "newRegistration",
      request: toRequest(data),
      email: data.email,
      consents,
      acknowledgedDuplicate: acknowledgedDuplicate === true,
    })
    return { ok: true, reference, clientSecret }
  } catch (error) {
    if (error instanceof ConsentRequired) return { ok: false, reason: "consent" }
    if (error instanceof ValidationError) return { ok: false, reason: "invalid" }
    if (error instanceof OpenApplicationExists) return { ok: false, reason: "duplicate" }
    failedBecause("checkout", error)
    return { ok: false, reason: "unavailable" }
  }
}
