"use client"

import Link from "next/link"
import { useRef, useState, type FormEvent, type ReactNode } from "react"
import type { ConsentKind } from "@/src/core/domain/application/consent"
import { formatEuros, type Money } from "@/src/core/domain/payment/money"
import { PROCESSING_FEE } from "@/src/core/domain/payment/pricing"
import { tooManyAttempts } from "@/app/(funnel)/too-many-attempts"
import { Alert } from "@/src/ui/alert"
import { Button } from "@/src/ui/button"
import { Checkbox } from "@/src/ui/checkbox"
import { useFunnelCheckout } from "./funnel-frame"
import type { PaymentDriver, PaymentMode } from "./payment-driver"
import { SimulatedPaymentFields } from "./simulated-payment-fields"
import { StripePaymentFields } from "./stripe/stripe-payment-fields"

export type StartCheckoutResult =
  | { ok: true; reference: string; clientSecret: string }
  | { ok: false; reason: "invalid" | "consent" | "duplicate" | "unavailable" }
  | { ok: false; reason: "invite" | "full" }
  | { ok: false; reason: "limited"; retryAfterMinutes: number }

const COUNT_WORDS: Record<number, string> = { 2: "die beiden", 3: "alle drei" }

const linkClass = "underline underline-offset-4 hover:text-orange-dark"

export function CheckoutPanel({
  total,
  priceLabel,
  consents,
  payment,
  returnPath,
  orderKey,
  startCheckout,
  completeSimulatedPayment,
  onPaid,
  children,
}: {
  total: Money
  priceLabel: string
  consents: readonly { kind: ConsentKind; label: ReactNode }[]
  payment: PaymentMode
  returnPath: string
  orderKey: string
  startCheckout(input: { consents: Partial<Record<ConsentKind, boolean>>; acknowledgedDuplicate?: true }): Promise<StartCheckoutResult>
  completeSimulatedPayment(reference: string): Promise<{ ok: boolean }>
  onPaid(reference: string): void
  children: ReactNode
}) {
  const driverRef = useRef<PaymentDriver | null>(null)
  const funnel = useFunnelCheckout()
  const [ticked, setTicked] = useState<Partial<Record<ConsentKind, boolean>>>({})
  const [duplicate, setDuplicate] = useState(false)
  const [wantsAnother, setWantsAnother] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string>()
  const consented = consents.every(({ kind }) => ticked[kind] === true) && (!duplicate || wantsAnother)

  function busy(running: boolean) {
    setPaying(running)
    funnel.setPaying(running)
  }

  async function pay(event: FormEvent) {
    event.preventDefault()
    if (!consented || paying) return
    if (!driverRef.current) {
      setError("Das Zahlungsformular ist noch nicht geladen. Bitte warten Sie einen Moment oder laden Sie die Seite neu. Ein Werbeblocker kann es verhindern.")
      return
    }
    busy(true)
    setError(undefined)
    try {
      const failed = await takePayment(driverRef.current)
      if (failed) setError(failed)
    } catch {
      setError("Das hat gerade nicht geklappt. Bitte versuchen Sie es in ein paar Minuten noch einmal.")
    } finally {
      busy(false)
    }
  }

  async function takePayment(driver: PaymentDriver): Promise<string | undefined> {
    const invalid = await driver.prepare()
    if (invalid) return invalid

    let order = funnel.orderFor(orderKey)
    if (!order) {
      const started = await startCheckout({
        consents: Object.fromEntries(consents.map(({ kind }) => [kind, ticked[kind] === true])),
        ...(wantsAnother ? { acknowledgedDuplicate: true as const } : {}),
      })
      if (!started.ok) {
        if (started.reason === "duplicate") {
          setDuplicate(true)
          return undefined
        }
        if (started.reason === "limited") return tooManyAttempts(started.retryAfterMinutes)
        if (started.reason === "full") return "Heute sind alle Plätze vergeben. Bitte versuchen Sie es morgen noch einmal."
        if (started.reason === "invite") return "Ihre Einladung gilt nicht mehr. Bitte schreiben Sie uns, wenn Sie weiter bestellen möchten."
        return started.reason === "invalid"
          ? "Einige Angaben sind nicht gültig. Bitte gehen Sie einen Schritt zurück und prüfen Sie sie."
          : "Das hat gerade nicht geklappt. Bitte versuchen Sie es in ein paar Minuten noch einmal."
      }
      order = { key: orderKey, reference: started.reference, clientSecret: started.clientSecret }
      funnel.keep(order)
    }

    const declined = await driver.confirm(order)
    if (declined) return declined
    onPaid(order.reference)
  }

  return (
    <form onSubmit={pay} noValidate className="flex flex-col gap-(--field-gap) pb-28 md:pb-0">
      {children}

      <section aria-labelledby="review-price" className="flex flex-col gap-3">
        <h2 id="review-price" className="text-h4 text-grau-dark">
          Preis
        </h2>
        <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-body">
          <dt className="font-normal text-grau-dark">{priceLabel}</dt>
          <dd className="text-right text-h3 text-grau-dark">{formatEuros(total)}</dd>
        </dl>
        <Alert variant="warning" className="measure">
          Stornieren Sie nach einem korrigierbaren Fehler oder kann der Antrag nicht korrigiert werden, behalten wir{" "}
          {formatEuros(PROCESSING_FEE)} Bearbeitungsgebühr ein und erstatten den Rest innerhalb von 3–5 Werktagen.{" "}
          <Link href="/agb" target="_blank" rel="noopener" className={linkClass}>
            Mehr in den AGB
          </Link>
        </Alert>
      </section>

      <section aria-labelledby="review-payment" className="flex flex-col gap-3">
        <h2 id="review-payment" className="text-h4 text-grau-dark">
          Zahlung
        </h2>
        {payment.kind === "stripe" ? (
          <StripePaymentFields publishableKey={payment.publishableKey} amountCents={total.cents} returnPath={returnPath} driverRef={driverRef} />
        ) : (
          <SimulatedPaymentFields driverRef={driverRef} completeSimulatedPayment={completeSimulatedPayment} />
        )}
      </section>

      <div className="flex flex-col gap-4">
        {consents.map(({ kind, label }) => (
          <Consent key={kind} checked={ticked[kind] === true} onChange={(checked) => setTicked((current) => ({ ...current, [kind]: checked }))}>
            {label}
          </Consent>
        ))}
      </div>

      {duplicate ? (
        <div className="flex flex-col gap-4">
          <Alert role="alert" variant="warning" className="measure">
            Für dieses Fahrzeug läuft bereits ein Antrag bei uns. Ein zweiter Antrag für dasselbe Fahrzeug wird vom KBA voraussichtlich
            abgelehnt.
          </Alert>
          <Consent checked={wantsAnother} onChange={setWantsAnother}>
            Ich möchte trotzdem einen weiteren Antrag stellen.
          </Consent>
        </div>
      ) : null}

      {error ? (
        <Alert role="alert" variant="error" className="measure">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:border-t max-md:border-border max-md:bg-white max-md:px-(--gutter) max-md:py-3 max-md:shadow-elev-2">
        <div className="flex items-center justify-between gap-4 md:justify-start">
          <span className="text-body text-grau-dark md:hidden">{formatEuros(total)}</span>
          <Button type="submit" disabled={!consented || paying} aria-describedby={consented ? undefined : "pay-hint"}>
            {paying ? "Zahlung läuft …" : "Jetzt bezahlen"}
          </Button>
        </div>
        {consented ? null : (
          <p id="pay-hint" className="text-small text-grau-bright">
            {duplicate ? "Bitte bestätigen Sie zuerst die Punkte oben." : `Bitte bestätigen Sie zuerst ${COUNT_WORDS[consents.length] ?? "die"} Punkte oben.`}
          </p>
        )}
      </div>
    </form>
  )
}

function Consent({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="measure flex cursor-pointer items-start gap-3 text-body text-grau-dark">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>{children}</span>
    </label>
  )
}
