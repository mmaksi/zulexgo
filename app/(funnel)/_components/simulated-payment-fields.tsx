"use client"

import { useEffect, type RefObject } from "react"
import { Alert } from "@/src/ui/alert"
import type { PaymentDriver } from "./payment-driver"

/** Where no payment provider is configured (dev, a demo): no money moves, the server plays the customer paying. */
export function SimulatedPaymentFields({
  driverRef,
  completeSimulatedPayment,
}: {
  driverRef: RefObject<PaymentDriver | null>
  completeSimulatedPayment: (reference: string) => Promise<{ ok: boolean }>
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
    <Alert>Testmodus: Hier ist kein Zahlungsanbieter angebunden. Es wird kein Geld bewegt.</Alert>
  )
}
