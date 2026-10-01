"use server"

import { getContainer } from "@/src/config/container"
import { parseApplicationReference } from "@/src/core/domain/application-reference"
import { OpenApplicationExists } from "@/src/core/errors/open-application-exists"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkEligibility } from "@/src/core/use-cases/check-eligibility"
import { confirmPayment } from "@/src/core/use-cases/confirm-payment"
import { submitCheckout } from "@/src/core/use-cases/submit-checkout"
import type { CheckoutActions } from "./_components/checkout-actions"
import { toRequest } from "@/app/_components/vehicle-data"

/**
 * Reachable by any POST, so every input is treated as untrusted and validated
 * by the use case. Failures are logged by name only: the input holds security
 * codes.
 */

const failedBecause = (action: string, error: unknown) => {
  console.error(`[funnel] ${action} failed: ${error instanceof Error ? error.name : "unknown error"}`)
}

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
  if (consents?.terms !== true || consents?.earlyStart !== true) return { ok: false, reason: "consent" }
  try {
    const { reference, clientSecret } = await submitCheckout(getContainer(), {
      request: toRequest(vehicle, plateCount),
      email: vehicle.email,
      acknowledgedDuplicate: acknowledgedDuplicate === true,
    })
    return { ok: true, reference, clientSecret }
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, reason: "invalid" }
    if (error instanceof OpenApplicationExists) return { ok: false, reason: "duplicate" }
    failedBecause("checkout", error)
    return { ok: false, reason: "unavailable" }
  }
}

export const completeSimulatedPaymentAction: CheckoutActions["completeSimulatedPayment"] = async (reference) => {
  const container = getContainer()
  if (!container.simulateCustomerPayment) return { ok: false }
  try {
    const application = await container.repository.get(parseApplicationReference(reference))
    if (!application) return { ok: false }
    await container.simulateCustomerPayment(application.payment.id)
    await confirmPayment(container, application.reference)
    return { ok: true }
  } catch (error) {
    failedBecause("simulated payment", error)
    return { ok: false }
  }
}
