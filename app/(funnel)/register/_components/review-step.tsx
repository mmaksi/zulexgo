"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { CheckoutPanel } from "@/app/(funnel)/_components/checkout-panel"
import type { PaymentMode } from "@/app/(funnel)/_components/payment-driver"
import type { RegistrationActions } from "./registration-actions"
import { ENGINE_CHOICES, MONTH_NAMES, type RegistrationData } from "./registration-data"

const MASK = "•••••••"

const linkClass = "underline underline-offset-4 hover:text-orange-dark"

const dateOf = (isoDate: string) => isoDate.split("-").reverse().join(".")
const ibanOf = (iban: string) => iban.replace(/\s+/g, "").toUpperCase().replace(/(.{4})(?=.)/g, "$1 ")

function plateOf({ engineType, electric, seasonal, seasonFrom, seasonUntil }: RegistrationData): string {
  const options = [
    engineType === "electric" && electric ? "E-Kennzeichen" : undefined,
    seasonal ? `Saison von ${MONTH_NAMES[Number(seasonFrom) - 1]} bis ${MONTH_NAMES[Number(seasonUntil) - 1]}` : undefined,
  ].filter(Boolean)
  return ["Vergibt die Zulassungsstelle", ...options].join(", ")
}

export function ReviewStep({
  data,
  payment,
  actions,
  onPaid,
}: {
  data: RegistrationData
  payment: PaymentMode
  actions: RegistrationActions
  onPaid: (reference: string) => void
}) {
  return (
    <CheckoutPanel
      total={SERVICE_PRICES.newRegistration}
      priceLabel="Neuzulassung, Gesamtpreis inkl. Behördengebühr und MwSt."
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
            "Ich verlange ausdrücklich, dass ZulexGO vor Ablauf der Widerrufsfrist mit der Zulassung beginnt. Mir ist bekannt, dass mein Widerrufsrecht erlischt, sobald der Auftrag vollständig ausgeführt ist.",
        },
        {
          kind: "powerOfAttorney",
          label:
            "Ich bevollmächtige ZulexGO, die Zulassung in meinem Namen bei der Zulassungsbehörde zu beantragen und dafür meine Angaben weiterzugeben. Für die Kfz-Steuer erteile ich ein SEPA-Lastschriftmandat für das angegebene Konto.",
        },
      ]}
      payment={payment}
      returnPath="/register/bestaetigung"
      orderKey={JSON.stringify(data)}
      startCheckout={(checkout) => actions.startCheckout({ data, ...checkout })}
      completeSimulatedPayment={actions.completeSimulatedPayment}
      onPaid={onPaid}
    >
      <section aria-labelledby="review-summary" className="flex flex-col gap-6">
        <h2 id="review-summary" className="text-h4 text-grau-dark">
          Ihre Angaben
        </h2>
        <Group title="Fahrzeug">
          <Row term="FIN" value={data.vin} />
          <Row term="Antrieb" value={ENGINE_CHOICES.find(({ value }) => value === data.engineType)?.label ?? ""} />
          <Row term="Teil II, Nummer" value={data.part2Number} />
          <Row term="Teil II, Sicherheitscode" value={MASK} />
          <Row term="eVB-Nummer" value={MASK} />
        </Group>
        <Group title="Halter">
          <Row term="Name" value={`${data.firstName} ${data.lastName}`} />
          <Row term="Geburtsdatum" value={dateOf(data.birthDate)} />
          <Row term="Geburtsort" value={data.birthPlace} />
          <Row term="Adresse" value={`${data.street} ${data.houseNumber}, ${data.postcode} ${data.city}`} />
          <Row term="Telefon" value={data.phone} />
          <Row term="E-Mail" value={data.email} />
        </Group>
        <Group title="Kennzeichen">
          <Row term="Kennzeichen" value={plateOf(data)} />
        </Group>
        <Group title="Kfz-Steuer">
          <Row term="IBAN" value={ibanOf(data.iban)} />
          <Row term="BIC" value={data.bic} />
          <Row term="Bank" value={data.bankName} />
        </Group>
      </section>
    </CheckoutPanel>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-body font-normal text-grau-dark">{title}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body sm:grid-cols-[13rem_1fr]">{children}</dl>
    </div>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <>
      <dt className="text-grau-bright">{term}</dt>
      <dd className="break-all text-grau-dark">{value}</dd>
    </>
  )
}
