import type { StartCheckoutResult } from "@/app/(funnel)/_components/checkout-panel"
import type { ConsentKind } from "@/src/core/domain/application/consent"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import type { PlateCount, VehicleData } from "@/app/_components/vehicle-data"

/** The server actions the funnel calls, passed in by the page so the funnel can be tested without a server. */
export interface CheckoutActions {
  checkEligibility(
    prefix: string,
  ): Promise<
    | { ok: true; prefix: string; ikfzStatus: IkfzStatus }
    | { ok: false; reason: "invalidPrefix" | "unavailable" }
    /** The address asked too often: it may try again after `retryAfterMinutes`. */
    | { ok: false; reason: "limited"; retryAfterMinutes: number }
  >
  startCheckout(input: {
    plateCount: PlateCount
    vehicle: VehicleData
    consents: Partial<Record<ConsentKind, boolean>>
    /** The customer was told an order for this vehicle is already open and wants another. */
    acknowledgedDuplicate?: boolean
  }): Promise<StartCheckoutResult>
  /** Only where no real payment provider is configured: plays the customer paying. */
  completeSimulatedPayment(reference: string): Promise<{ ok: boolean }>
}
