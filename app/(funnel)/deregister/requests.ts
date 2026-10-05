import { failedBecause } from "@/app/(funnel)/failed-because"
import type { StartCheckoutResult } from "@/app/(funnel)/_components/checkout-panel"
import { toRequest } from "@/app/_components/vehicle-data"
import { BetaFull } from "@/src/core/errors/application/beta-full"
import { ConsentRequired } from "@/src/core/errors/application/consent-required"
import { InviteRequired } from "@/src/core/errors/application/invite-required"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { ValidationError } from "@/src/core/errors/validation-error"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import type { CheckoutActions } from "./_components/checkout-actions"

/**
 * What the de-registration funnel's checkout action does. Reachable by any POST, so every input is
 * treated as untrusted and validated by the use case. Failures are logged by name only: the input holds
 * security codes.
 */
export async function startDeregistrationCheckout(
  deps: Dependencies,
  { plateCount, vehicle, consents, acknowledgedDuplicate }: Parameters<CheckoutActions["startCheckout"]>[0],
  /** The code the customer redeemed when the service was in beta, as the browser holds it: untrusted. */
  invite?: string,
): Promise<StartCheckoutResult> {
  try {
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
