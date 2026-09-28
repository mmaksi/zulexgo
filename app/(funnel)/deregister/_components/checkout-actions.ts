import type { IkfzStatus } from "@/src/core/domain/registration-authority"
import type { PlateCount, VehicleData } from "./vehicle-data"

/** The server actions the funnel calls, passed in by the page so the funnel can be tested without a server. */
export interface CheckoutActions {
  checkEligibility(prefix: string): Promise<{ ok: true; prefix: string; ikfzStatus: IkfzStatus } | { ok: false; reason: "invalidPrefix" | "unavailable" }>
  startCheckout(input: {
    plateCount: PlateCount
    vehicle: VehicleData
    consents: { terms: boolean; earlyStart: boolean }
  }): Promise<{ ok: true; reference: string; clientSecret: string } | { ok: false; reason: "invalid" | "consent" | "unavailable" }>
  /** Only where no real payment provider is configured: plays the customer paying. */
  completeSimulatedPayment(reference: string): Promise<{ ok: boolean }>
}

/**
 * How the review step takes the money. `prepare` validates the payment form
 * before anything is stored; `confirm` completes it once the order exists.
 * Each returns an error message for the customer, or nothing.
 */
export interface PaymentDriver {
  prepare(): Promise<string | undefined>
  confirm(order: { reference: string; clientSecret: string }): Promise<string | undefined>
}

export type PaymentMode = { kind: "stripe"; publishableKey: string } | { kind: "simulated" }
