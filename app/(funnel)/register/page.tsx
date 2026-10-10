import type { Metadata } from "next"
import { BetaGate } from "@/app/(funnel)/beta-gate"
import { requireOnSale } from "@/app/(funnel)/on-sale"
import { paymentModeOfDeployment } from "@/app/(funnel)/payment-mode"
import { completeSimulatedPaymentAction } from "@/app/(funnel)/simulated-payment-action"
import { checkEligibilityAction, startCheckoutAction } from "./actions"
import { RegistrationFunnel } from "./_components/registration-funnel"

export const metadata: Metadata = { title: "Fahrzeug zulassen — ZulexGO" }

export default async function RegisterPage() {
  await requireOnSale("newRegistration")

  return (
    <BetaGate service="newRegistration" name="Neuzulassung">
      <RegistrationFunnel
        payment={await paymentModeOfDeployment()}
        actions={{
          checkEligibility: checkEligibilityAction,
          startCheckout: startCheckoutAction,
          completeSimulatedPayment: completeSimulatedPaymentAction,
        }}
      />
    </BetaGate>
  )
}
