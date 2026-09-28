"use client"

import Link from "next/link"
import { useRef, useState, type FormEvent } from "react"
import { DEREGISTRATION_TOTAL, PROCESSING_FEE, SERVICE_PRICE } from "@/src/core/domain/pricing"
import { Button } from "@/src/ui/button"
import { Checkbox } from "@/src/ui/checkbox"
import type { CheckoutActions, PaymentDriver, PaymentMode } from "./checkout-actions"
import { euros } from "./money"
import { SimulatedPaymentFields } from "./simulated-payment-fields"
import { StripePaymentFields } from "./stripe/stripe-payment-fields"
import type { PlateCount, VehicleData } from "./vehicle-data"

const MASK = "•••"

/** site-contract §2.4: masked summary, full price, the fee notice and consent before the pay button. */
export function ReviewStep({
  plateCount,
  vehicle,
  payment,
  actions,
  onPaid,
}: {
  plateCount: PlateCount
  vehicle: VehicleData
  payment: PaymentMode
  actions: CheckoutActions
  onPaid: (reference: string) => void
}) {
  const driverRef = useRef<PaymentDriver | null>(null)
  const order = useRef<{ reference: string; clientSecret: string } | null>(null)
  const [terms, setTerms] = useState(false)
  const [earlyStart, setEarlyStart] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string>()
  const consented = terms && earlyStart

  async function pay(event: FormEvent) {
    event.preventDefault()
    if (!consented || paying || !driverRef.current) return
    setPaying(true)
    setError(undefined)
    const failed = await takePayment(driverRef.current)
    setPaying(false)
    if (failed) setError(failed)
  }

  async function takePayment(payment: PaymentDriver): Promise<string | undefined> {
    const invalid = await payment.prepare()
    if (invalid) return invalid

    // A declined card is retried on the same order, never a second one.
    if (!order.current) {
      const started = await actions.startCheckout({ plateCount, vehicle, consents: { terms, earlyStart } })
      if (!started.ok) {
        return started.reason === "invalid"
          ? "Einige Angaben sind nicht gültig. Bitte gehen Sie einen Schritt zurück und prüfen Sie sie."
          : "Das hat gerade nicht geklappt. Bitte versuchen Sie es in ein paar Minuten noch einmal."
      }
      order.current = { reference: started.reference, clientSecret: started.clientSecret }
    }

    const declined = await payment.confirm(order.current)
    if (declined) return declined
    onPaid(order.current.reference)
  }

  return (
    <form onSubmit={pay} noValidate className="flex flex-col gap-(--field-gap) pb-28 md:pb-0">
      <section aria-labelledby="review-summary" className="flex flex-col gap-3">
        <h2 id="review-summary" className="text-h4 text-grau-dark">
          Ihre Angaben
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
          <Row term="Kennzeichen" value={`${vehicle.prefix} ${vehicle.letters} ${vehicle.numbers}`} plate />
          <Row term="FIN" value={vehicle.vin} />
          <Row term="Sicherheitscodes" value={Array(plateCount === 2 ? 3 : 2).fill(MASK).join("  ")} />
          <Row term="E-Mail" value={vehicle.email} />
        </dl>
      </section>

      <section aria-labelledby="review-price" className="flex flex-col gap-3">
        <h2 id="review-price" className="text-h4 text-grau-dark">
          Preis
        </h2>
        <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-body">
          <dt>Abmeldung inkl. behördlicher Gebühr</dt>
          <dd className="text-right">{euros(SERVICE_PRICE)}</dd>
          <dt>Bearbeitungsgebühr</dt>
          <dd className="text-right">{euros(PROCESSING_FEE)}</dd>
          <dt className="font-normal text-grau-dark">Gesamt inkl. MwSt.</dt>
          <dd className="text-right text-h3 text-grau-dark">{euros(DEREGISTRATION_TOTAL)}</dd>
        </dl>
        <p className="measure border-l-4 border-warning bg-warning-tint p-4 text-body text-grau-dark">
          Stornieren Sie nach einem korrigierbaren Fehler oder kann der Antrag nicht korrigiert werden, behalten wir{" "}
          {euros(PROCESSING_FEE)} Bearbeitungsgebühr ein und erstatten den Rest.{" "}
          <Link href="/agb" className="underline underline-offset-4 hover:text-orange-dark">
            Mehr in den AGB
          </Link>
        </p>
      </section>

      <section aria-labelledby="review-payment" className="flex flex-col gap-3">
        <h2 id="review-payment" className="text-h4 text-grau-dark">
          Zahlung
        </h2>
        {payment.kind === "stripe" ? (
          <StripePaymentFields publishableKey={payment.publishableKey} amountCents={DEREGISTRATION_TOTAL.cents} driverRef={driverRef} />
        ) : (
          <SimulatedPaymentFields driverRef={driverRef} completeSimulatedPayment={actions.completeSimulatedPayment} />
        )}
      </section>

      <div className="flex flex-col gap-4">
        <Consent checked={terms} onChange={setTerms}>
          Ich akzeptiere die{" "}
          <Link href="/agb" className="underline underline-offset-4 hover:text-orange-dark">
            AGB
          </Link>{" "}
          und habe die Widerrufsbelehrung gelesen.
        </Consent>
        <Consent checked={earlyStart} onChange={setEarlyStart}>
          Ich verlange ausdrücklich, dass ZulexGO vor Ablauf der Widerrufsfrist mit der Abmeldung beginnt. Mir ist bekannt,
          dass mein Widerrufsrecht erlischt, sobald der Auftrag vollständig ausgeführt ist.
        </Consent>
      </div>

      {error ? (
        <p role="alert" className="measure border-l-4 border-error bg-error-tint p-4 text-body text-grau-dark">
          {error}
        </p>
      ) : null}

      {/* site-contract §3: on phones the CTA docks at the bottom with the total. */}
      <div className="flex flex-col gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:border-t max-md:border-border max-md:bg-white max-md:px-(--gutter) max-md:py-3 max-md:shadow-elev-2">
        <div className="flex items-center justify-between gap-4 md:justify-start">
          <span className="text-body text-grau-dark md:hidden">{euros(DEREGISTRATION_TOTAL)}</span>
          <Button type="submit" disabled={!consented || paying} aria-describedby={consented ? undefined : "pay-hint"}>
            {paying ? "Zahlung läuft …" : "Jetzt bezahlen"}
          </Button>
        </div>
        {consented ? null : (
          <p id="pay-hint" className="text-small text-grau-bright">
            Bitte bestätigen Sie zuerst die beiden Punkte oben.
          </p>
        )}
      </div>
    </form>
  )
}

function Row({ term, value, plate = false }: { term: string; value: string; plate?: boolean }) {
  return (
    <>
      <dt className="text-grau-bright">{term}</dt>
      <dd className={plate ? "plate-text text-grau-dark" : "break-all text-grau-dark"}>{value}</dd>
    </>
  )
}

function Consent({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="measure flex cursor-pointer items-start gap-3 text-body text-grau-dark">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>{children}</span>
    </label>
  )
}
