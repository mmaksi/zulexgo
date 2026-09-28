"use client"

import { useEffect, type RefObject } from "react"
import type { CheckoutActions, PaymentDriver } from "./checkout-actions"

/** Where no payment provider is configured (dev, a demo): no money moves, the server plays the customer paying. */
export function SimulatedPaymentFields({
  driverRef,
  completeSimulatedPayment,
}: {
  driverRef: RefObject<PaymentDriver | null>
  completeSimulatedPayment: CheckoutActions["completeSimulatedPayment"]
}) {
  useEffect(() => {
    driverRef.current = {
      prepare: async () => undefined,
      confirm: async ({ reference }) =>
        (await completeSimulatedPayment(reference)).ok ? undefined : "Die Testzahlung ist fehlgeschlagen.",
    }
    return () => {
      driverRef.current = null
    }
  }, [driverRef, completeSimulatedPayment])

  return (
    <p className="border-l-4 border-grau bg-info-tint p-4 text-body text-grau-dark">
      Testmodus: Hier ist kein Zahlungsanbieter angebunden. Es wird kein Geld bewegt.
    </p>
  )
}
