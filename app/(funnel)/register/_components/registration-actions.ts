import type { StartCheckoutResult } from "@/app/(funnel)/_components/checkout-panel"
import type { ConsentKind } from "@/src/core/domain/application/consent"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import type { RegistrationData } from "./registration-data"

export interface RegistrationActions {
  checkEligibility(
    postcode: string,
  ): Promise<
    | { ok: true; postcode: string; ikfzStatus: IkfzStatus }
    | { ok: false; reason: "invalidPostcode" | "unavailable" }
    | { ok: false; reason: "limited"; retryAfterMinutes: number }
  >
  startCheckout(input: {
    data: RegistrationData
    consents: Partial<Record<ConsentKind, boolean>>
    acknowledgedDuplicate?: boolean
  }): Promise<StartCheckoutResult>
  completeSimulatedPayment(reference: string): Promise<{ ok: boolean }>
}
