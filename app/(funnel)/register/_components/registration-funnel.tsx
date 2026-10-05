"use client"

import { useState } from "react"
import { FunnelFrame } from "@/app/(funnel)/_components/funnel-frame"
import type { PaymentMode } from "@/app/(funnel)/_components/payment-driver"
import { AvailabilityNotice } from "./availability-notice"
import { Confirmation } from "./confirmation"
import { KeeperStep } from "./keeper-step"
import { PlateStep } from "./plate-step"
import type { RegistrationActions } from "./registration-actions"
import { EMPTY_REGISTRATION, type RegistrationData } from "./registration-data"
import { RequirementsStep, type RegistrationEligibility } from "./requirements-step"
import { ReviewStep } from "./review-step"
import { TaxStep } from "./tax-step"
import { VehicleStep } from "./vehicle-step"

const STEPS = [
  { title: "Voraussetzungen", heading: "Können Sie online zulassen?" },
  { title: "Fahrzeug", heading: "Ihr Fahrzeug" },
  { title: "Halter", heading: "Der Halter" },
  { title: "Kennzeichen", heading: "Ihr Kennzeichen" },
  { title: "Kfz-Steuer", heading: "Konto für die Kfz-Steuer" },
  { title: "Prüfen & bezahlen", heading: "Prüfen und bezahlen" },
  { title: "Bestätigung", heading: "Ihr Antrag ist eingegangen" },
] as const

const CONFIRMATION = STEPS.length - 1

/**
 * The Neuzulassung funnel, one decision per screen (registration plan N6). State lives here, never in
 * the URL or in browser storage: it holds an IBAN, a birth date and the codes of the car's papers, so
 * going back keeps what was entered and a reload loses it, which the leave-page warning says.
 */
export function RegistrationFunnel({ payment, actions }: { payment: PaymentMode; actions: RegistrationActions }) {
  const [eligibility, setEligibility] = useState<RegistrationEligibility>()
  const [data, setData] = useState<RegistrationData>(EMPTY_REGISTRATION)
  const [reference, setReference] = useState<string>()

  return (
    <FunnelFrame steps={STEPS} paid={reference !== undefined}>
      {({ step, goTo }) => {
        const entered = { data, onChange: (changes: Partial<RegistrationData>) => setData((current) => ({ ...current, ...changes })) }
        const to = (next: number) => () => goTo(next)

        return (
          <>
            {step === 0 ? (
              <RequirementsStep
                initialPostcode={eligibility?.postcode}
                checkEligibility={actions.checkEligibility}
                onEligible={(result) => {
                  setEligibility(result)
                  setData((current) => ({ ...current, postcode: result.postcode }))
                  goTo(1)
                }}
              />
            ) : null}

            {/* Every later step needs what the first one found. After a reload the browser's back button can land on one without it. */}
            {step === 1 && eligibility ? (
              <div className="flex flex-col gap-(--field-gap)">
                <AvailabilityNotice ikfzStatus={eligibility.ikfzStatus} />
                <VehicleStep {...entered} onNext={to(2)} />
              </div>
            ) : null}

            {step === 2 && eligibility ? (
              <KeeperStep
                {...entered}
                eligibility={eligibility}
                checkEligibility={actions.checkEligibility}
                onNext={(current) => {
                  setEligibility(current)
                  goTo(3)
                }}
              />
            ) : null}

            {step === 3 && eligibility ? <PlateStep {...entered} onNext={to(4)} /> : null}
            {step === 4 && eligibility ? <TaxStep {...entered} onNext={to(5)} /> : null}

            {step === 5 && eligibility ? (
              <ReviewStep
                data={data}
                payment={payment}
                actions={actions}
                onPaid={(paid) => {
                  setReference(paid)
                  goTo(CONFIRMATION)
                }}
              />
            ) : null}

            {step === CONFIRMATION && reference ? <Confirmation reference={reference} email={data.email} /> : null}
          </>
        )
      }}
    </FunnelFrame>
  )
}
