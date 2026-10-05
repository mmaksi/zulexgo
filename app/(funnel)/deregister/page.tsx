import type { Metadata } from "next"
import { paymentModeOfDeployment } from "@/app/(funnel)/payment-mode"
import { completeSimulatedPaymentAction } from "@/app/(funnel)/simulated-payment-action"
import { checkEligibilityAction, startCheckoutAction } from "./actions"
import { DeregistrationFunnel } from "./_components/deregistration-funnel"

export const metadata: Metadata = { title: "Fahrzeug abmelden — ZulexGO" }

export default async function DeregisterPage() {
  return (
    <DeregistrationFunnel
      payment={await paymentModeOfDeployment()}
      actions={{
        checkEligibility: checkEligibilityAction,
        startCheckout: startCheckoutAction,
        completeSimulatedPayment: completeSimulatedPaymentAction,
      }}
    />
  )
}
