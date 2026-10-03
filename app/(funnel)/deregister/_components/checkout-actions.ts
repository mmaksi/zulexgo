import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import type { PlateCount, VehicleData } from "@/app/_components/vehicle-data"

/** The server actions the funnel calls, passed in by the page so the funnel can be tested without a server. */
export interface CheckoutActions {
  checkEligibility(prefix: string): Promise<{ ok: true; prefix: string; ikfzStatus: IkfzStatus } | { ok: false; reason: "invalidPrefix" | "unavailable" }>
  startCheckout(input: {
    plateCount: PlateCount
    vehicle: VehicleData
    consents: { terms: boolean; earlyStart: boolean }
    /** The customer was told an order for this vehicle is already open and wants another. */
    acknowledgedDuplicate?: boolean
  }): Promise<
    { ok: true; reference: string; clientSecret: string } | { ok: false; reason: "invalid" | "consent" | "duplicate" | "unavailable" }
  >
  /** Only where no real payment provider is configured: plays the customer paying. */
  completeSimulatedPayment(reference: string): Promise<{ ok: boolean }>
}
