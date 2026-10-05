"use server"

import { getContainer } from "@/src/config/container"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkRegistrationEligibility } from "@/src/core/use-cases/checkout/check-registration-eligibility"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { failedBecause } from "@/app/(funnel)/failed-because"
import type { RegistrationActions } from "./_components/registration-actions"
import { toRequest } from "./_components/registration-data"

/**
 * Reachable by any POST, so every input is treated as untrusted and validated by the use case.
 * Failures are logged by name only: the input holds an IBAN, a birth date and the codes of the
 * car's papers.
 */

export const checkEligibilityAction: RegistrationActions["checkEligibility"] = async (postcode) => {
  try {
    return { ok: true, ...(await checkRegistrationEligibility(getContainer(), postcode)) }
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, reason: "invalidPostcode" }
    failedBecause("postcode check", error)
    return { ok: false, reason: "unavailable" }
  }
}

export const startCheckoutAction: RegistrationActions["startCheckout"] = async ({ data, consents, acknowledgedDuplicate }) => {
  try {
    const { reference, clientSecret } = await submitCheckout(getContainer(), {
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
