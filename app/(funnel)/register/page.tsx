import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isOnSale } from "@/src/core/domain/application/service"
import { paymentModeOfDeployment } from "@/app/(funnel)/payment-mode"
import { completeSimulatedPaymentAction } from "@/app/(funnel)/simulated-payment-action"
import { checkEligibilityAction, startCheckoutAction } from "./actions"
import { RegistrationFunnel } from "./_components/registration-funnel"

export const metadata: Metadata = { title: "Fahrzeug zulassen — ZulexGO" }

export default async function RegisterPage() {
  // The funnel collects an IBAN and a birth date, so it exists for a customer only while checkout will
  // take the order (`SERVICES_ON_SALE`; launch plan N9 adds newRegistration). Until then it is not found.
  if (!isOnSale("newRegistration")) notFound()

  return (
    <RegistrationFunnel
      payment={await paymentModeOfDeployment()}
      actions={{
        checkEligibility: checkEligibilityAction,
        startCheckout: startCheckoutAction,
        completeSimulatedPayment: completeSimulatedPaymentAction,
      }}
    />
  )
}
