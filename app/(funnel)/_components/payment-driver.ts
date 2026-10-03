/**
 * How a funnel's review step takes the money, the same for every funnel. `prepare` validates the
 * payment form before anything is stored; `confirm` completes it once the order exists.
 * Each returns an error message for the customer, or nothing.
 */
export interface PaymentDriver {
  prepare(): Promise<string | undefined>
  confirm(order: { reference: string; clientSecret: string }): Promise<string | undefined>
}

/** The deployment's payment mode: Stripe's Payment Element, or the simulated form where no provider is configured. */
export type PaymentMode = { kind: "stripe"; publishableKey: string } | { kind: "simulated" }
