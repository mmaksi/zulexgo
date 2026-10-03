"use client"

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import { loadStripe, type Appearance } from "@stripe/stripe-js"
import { useEffect, useMemo, type RefObject } from "react"
import type { PaymentDriver } from "@/app/(funnel)/_components/payment-driver"

/** design-standard.md tokens, as far as Stripe's Appearance API reaches into its iframe. */
const APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#272828",
    colorText: "#272828",
    colorTextSecondary: "#58626D",
    colorDanger: "#A32A1E",
    colorBackground: "#FFFFFF",
    // No web font is loaded into Stripe's iframe: fonts are self-hosted (design-standard §3.1), never fetched
    // from Google, so the fields fall back to Helvetica Neue or Arial.
    fontFamily: "Kanit, 'Helvetica Neue', Arial, sans-serif",
    fontSizeBase: "16px",
    borderRadius: "2px",
    spacingUnit: "4px",
  },
}

/**
 * Stripe's Payment Element, deferred: the PaymentIntent is created only when
 * the customer pays, with the same amount, currency, capture method and
 * payment method types given here, as Stripe requires. Cards only, which
 * brings Apple Pay and Google Pay; Link is off, so Stripe collects no email.
 */
export function StripePaymentFields({
  publishableKey,
  amountCents,
  driverRef,
}: {
  publishableKey: string
  amountCents: number
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
      <Fields driverRef={driverRef} />
    </Elements>
  )
}

function Fields({ driverRef }: { driverRef: RefObject<PaymentDriver | null> }) {
  const stripe = useStripe()
  const elements = useElements()

  useEffect(() => {
    if (!stripe || !elements) return
    driverRef.current = {
      prepare: async () => (await elements.submit()).error?.message,
      confirm: async ({ reference, clientSecret }) => {
        const returnUrl = new URL("/deregister/bestaetigung", window.location.origin)
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
  }, [stripe, elements, driverRef])

  return <PaymentElement options={{ layout: "tabs", wallets: { link: "never" } }} />
}
