"use client"

import { useState } from "react"
import { FunnelFrame } from "@/app/(funnel)/_components/funnel-frame"
import type { PaymentMode } from "@/app/(funnel)/_components/payment-driver"
import { EMPTY_VEHICLE, type VehicleData } from "@/app/_components/vehicle-data"
import { AvailabilityNotice } from "./availability-notice"
import type { CheckoutActions } from "./checkout-actions"
import { Confirmation } from "./confirmation"
import { EligibilityStep, type Eligibility } from "./eligibility-step"
import { ReviewStep } from "./review-step"
import { VehicleStep } from "./vehicle-step"

const STEPS = [
  { title: "Voraussetzungen", heading: "Können Sie online abmelden?" },
  { title: "Fahrzeugdaten", heading: "Ihr Fahrzeug" },
  { title: "Prüfen & bezahlen", heading: "Prüfen und bezahlen" },
  { title: "Bestätigung", heading: "Ihr Antrag ist eingegangen" },
] as const

const CONFIRMATION = STEPS.length - 1

// State stays in memory, never in the URL: it holds security codes.
export function DeregistrationFunnel({ payment, actions }: { payment: PaymentMode; actions: CheckoutActions }) {
  const [eligibility, setEligibility] = useState<Eligibility>()
  const [vehicle, setVehicle] = useState<VehicleData>(EMPTY_VEHICLE)
  const [reference, setReference] = useState<string>()

  return (
    <FunnelFrame steps={STEPS} paid={reference !== undefined}>
      {({ step, goTo }) => (
        <>
          {step === 0 ? (
            <EligibilityStep
              initial={eligibility && { ...eligibility, hasDocuments: true }}
              checkEligibility={actions.checkEligibility}
              onEligible={(result) => {
                setEligibility(result)
                setVehicle((current) => ({ ...current, prefix: result.prefix }))
                goTo(1)
              }}
            />
          ) : null}

          {step === 1 && eligibility ? (
            <div className="flex flex-col gap-(--field-gap)">
              <AvailabilityNotice ikfzStatus={eligibility.ikfzStatus} />
              <VehicleStep
                plateCount={eligibility.plateCount}
                initial={vehicle}
                onNext={(data) => {
                  setVehicle(data)
                  goTo(2)
                }}
              />
            </div>
          ) : null}

          {step === 2 && eligibility ? (
            <ReviewStep
              plateCount={eligibility.plateCount}
              vehicle={vehicle}
              payment={payment}
              actions={actions}
              onPaid={(paid) => {
                setReference(paid)
                goTo(CONFIRMATION)
              }}
            />
          ) : null}

          {step === CONFIRMATION && reference ? <Confirmation reference={reference} email={vehicle.email} /> : null}
        </>
      )}
    </FunnelFrame>
  )
}
