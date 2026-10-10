export interface PaymentDriver {
  prepare(): Promise<string | undefined>
  confirm(order: { reference: string; clientSecret: string }): Promise<string | undefined>
}

export type PaymentMode = { kind: "stripe"; publishableKey: string } | { kind: "simulated" }
