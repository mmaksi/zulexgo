"use server"

import { getContainer } from "@/src/config/container"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkEligibility } from "@/src/core/use-cases/checkout/check-eligibility"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import type { CheckoutActions } from "./_components/checkout-actions"
import { toRequest } from "@/app/_components/vehicle-data"
import { failedBecause } from "@/app/(funnel)/failed-because"

/**
 * Reachable by any POST, so every input is treated as untrusted and validated
 * by the use case. Failures are logged by name only: the input holds security
 * codes.
 */

export const checkEligibilityAction: CheckoutActions["checkEligibility"] = async (prefix) => {
  try {
    return { ok: true, ...(await checkEligibility(getContainer(), prefix)) }
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, reason: "invalidPrefix" }
    failedBecause("eligibility check", error)
    return { ok: false, reason: "unavailable" }
  }
}

export const startCheckoutAction: CheckoutActions["startCheckout"] = async ({ plateCount, vehicle, consents, acknowledgedDuplicate }) => {
  try {
    const { reference, clientSecret } = await submitCheckout(getContainer(), {
      service: "deregistration",
      request: toRequest(vehicle, plateCount),
      email: vehicle.email,
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
