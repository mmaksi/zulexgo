import type { StartCheckoutResult } from "@/app/(funnel)/_components/checkout-panel"
import type { ConsentKind } from "@/src/core/domain/application/consent"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import type { PlateCount, VehicleData } from "@/app/_components/vehicle-data"

export interface CheckoutActions {
  checkEligibility(
    prefix: string,
  ): Promise<
    | { ok: true; prefix: string; ikfzStatus: IkfzStatus }
    | { ok: false; reason: "invalidPrefix" | "unavailable" }
    | { ok: false; reason: "limited"; retryAfterMinutes: number }
  >
  startCheckout(input: {
    plateCount: PlateCount
    vehicle: VehicleData
    consents: Partial<Record<ConsentKind, boolean>>
    acknowledgedDuplicate?: boolean
  }): Promise<StartCheckoutResult>
  completeSimulatedPayment(reference: string): Promise<{ ok: boolean }>
}
