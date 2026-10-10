"use client"

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe, type Appearance } from "@stripe/stripe-js"
import { useEffect, useMemo, type RefObject } from "react"
import type { PaymentDriver } from "@/app/(funnel)/_components/payment-driver"

const APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#272828",
    colorText: "#272828",
    colorTextSecondary: "#58626D",
    colorDanger: "#A32A1E",
    colorBackground: "#FFFFFF",
    fontFamily: "Kanit, 'Helvetica Neue', Arial, sans-serif",
    fontSizeBase: "16px",
    borderRadius: "2px",
    spacingUnit: "4px",
  },
}

// Deferred intent: Stripe requires these options to match the PaymentIntent the server creates
export function StripePaymentFields({
  publishableKey,
  amountCents,
  returnPath,
  driverRef,
}: {
  publishableKey: string
  amountCents: number
  returnPath: string
  driverRef: RefObject<PaymentDriver | null>
}) {
  const stripe = useMemo(() => loadStripe(publishableKey), [publishableKey])
  return (
    <Elements
      stripe={stripe}
      options={{
        mode: "payment",
        amount: amountCents,
        currency: "eur",
        captureMethod: "manual",
        paymentMethodTypes: ["card"],
        locale: "de",
        appearance: APPEARANCE,
      }}
    >
      <Fields returnPath={returnPath} driverRef={driverRef} />
    </Elements>
  )
}

function Fields({ returnPath, driverRef }: { returnPath: string; driverRef: RefObject<PaymentDriver | null> }) {
  const stripe = useStripe()
  const elements = useElements()

  useEffect(() => {
    if (!stripe || !elements) return
    driverRef.current = {
      prepare: async () => (await elements.submit()).error?.message,
      confirm: async ({ reference, clientSecret }) => {
        const returnUrl = new URL(returnPath, window.location.origin)
        returnUrl.searchParams.set("auftrag", reference)
        const { error } = await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams: { return_url: returnUrl.toString() },
          redirect: "if_required",
        })
        return error?.message
      },
    }
    return () => {
      driverRef.current = null
    }
  }, [stripe, elements, returnPath, driverRef])

  return <PaymentElement options={{ layout: "tabs", wallets: { link: "never" } }} />
}
