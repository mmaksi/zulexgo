"use server"

import { getContainer } from "@/src/config/container"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkEligibility } from "@/src/core/use-cases/checkout/check-eligibility"
import type { CheckoutActions } from "./_components/checkout-actions"
import { failedBecause } from "@/app/(funnel)/failed-because"
import { heldInvite } from "@/app/(funnel)/invite-cookie"
import { startDeregistrationCheckout } from "./requests"

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

export const startCheckoutAction: CheckoutActions["startCheckout"] = async (input) =>
  startDeregistrationCheckout(getContainer(), input, await heldInvite("deregistration"))
