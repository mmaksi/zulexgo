"use client"

import Link from "next/link"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { CheckoutPanel } from "@/app/(funnel)/_components/checkout-panel"
import type { PaymentMode } from "@/app/(funnel)/_components/payment-driver"
import type { CheckoutActions } from "./checkout-actions"
import type { PlateCount, VehicleData } from "@/app/_components/vehicle-data"
import { PlateFrame } from "@/src/ui/plate-frame"

const MASK = "•••"

const linkClass = "underline underline-offset-4 hover:text-orange-dark"

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
  return (
    <CheckoutPanel
      total={SERVICE_PRICES.deregistration}
      priceLabel="Abmeldung, Gesamtpreis inkl. Behördengebühr und MwSt."
      consents={[
        {
          kind: "terms",
          label: (
            <>
              Ich akzeptiere die{" "}
              <Link href="/agb" target="_blank" rel="noopener" className={linkClass}>
                AGB
              </Link>{" "}
              und habe die Widerrufsbelehrung gelesen.
            </>
          ),
        },
        {
          kind: "earlyStart",
          label:
            "Ich verlange ausdrücklich, dass ZulexGO vor Ablauf der Widerrufsfrist mit der Abmeldung beginnt. Mir ist bekannt, dass mein Widerrufsrecht erlischt, sobald der Auftrag vollständig ausgeführt ist.",
        },
      ]}
      payment={payment}
      returnPath="/deregister/bestaetigung"
      orderKey={JSON.stringify([plateCount, vehicle])}
      startCheckout={(checkout) => actions.startCheckout({ plateCount, vehicle, ...checkout })}
      completeSimulatedPayment={actions.completeSimulatedPayment}
      onPaid={onPaid}
    >
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
    </CheckoutPanel>
  )
}

function Row({ term, value, plate = false }: { term: string; value: string; plate?: boolean }) {
  return (
    <>
      <dt className="text-grau-bright">{term}</dt>
      {plate ? (
        <dd>
          <PlateFrame className="inline-flex">
            <span className="plate-text block px-3 py-1 text-grau-dark">{value}</span>
          </PlateFrame>
        </dd>
      ) : (
        <dd className="break-all text-grau-dark">{value}</dd>
      )}
    </>
  )
}
