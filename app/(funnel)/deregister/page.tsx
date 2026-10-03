import type { Metadata } from "next"
import { connection } from "next/server"
import { getContainer } from "@/src/config/container"
import { completeSimulatedPaymentAction, checkEligibilityAction, startCheckoutAction } from "./actions"
import type { PaymentMode } from "@/app/(funnel)/_components/payment-driver"
import { DeregistrationFunnel } from "./_components/deregistration-funnel"

export const metadata: Metadata = { title: "Fahrzeug abmelden — ZulexGO" }

export default async function DeregisterPage() {
  // The payment mode is the deployment's, read at request time, not baked in at build.
  await connection()
  const { env } = getContainer()
  const payment: PaymentMode =
    env.PAYMENT_DRIVER === "stripe"
      ? { kind: "stripe", publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY! }
      : { kind: "simulated" }

  return (
    <DeregistrationFunnel
      payment={payment}
      actions={{
        checkEligibility: checkEligibilityAction,
        startCheckout: startCheckoutAction,
        completeSimulatedPayment: completeSimulatedPaymentAction,
      }}
    />
  )
}
