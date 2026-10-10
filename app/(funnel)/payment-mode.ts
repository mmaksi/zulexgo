import "server-only"
import { connection } from "next/server"
import { getContainer } from "@/src/config/container"
import type { PaymentMode } from "./_components/payment-driver"

export async function paymentModeOfDeployment(): Promise<PaymentMode> {
  await connection()
  const { env } = getContainer()
  return env.PAYMENT_DRIVER === "stripe"
    ? { kind: "stripe", publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY! }
    : { kind: "simulated" }
}
