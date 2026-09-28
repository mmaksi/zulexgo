"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/src/ui/button"
import { AvailabilityNotice } from "./availability-notice"
import type { CheckoutActions, PaymentMode } from "./checkout-actions"
import { Confirmation } from "./confirmation"
import { EligibilityStep, type Eligibility } from "./eligibility-step"
import { ReviewStep } from "./review-step"
import { EMPTY_VEHICLE, type VehicleData } from "./vehicle-data"
import { VehicleStep } from "./vehicle-step"

const STEPS = [
  { title: "Voraussetzungen", heading: "Können Sie online abmelden?" },
  { title: "Fahrzeugdaten", heading: "Ihr Fahrzeug" },
  { title: "Prüfen & bezahlen", heading: "Prüfen und bezahlen" },
  { title: "Bestätigung", heading: "Ihr Antrag ist eingegangen" },
] as const

/**
 * The de-registration funnel, one step per screen. State lives here, never in
 * the URL (it holds security codes), so going back keeps what was entered.
 */
export function DeregistrationFunnel({ payment, actions }: { payment: PaymentMode; actions: CheckoutActions }) {
  const [step, setStep] = useState(0)
  const [eligibility, setEligibility] = useState<Eligibility>()
  const [vehicle, setVehicle] = useState<VehicleData>(EMPTY_VEHICLE)
  const [reference, setReference] = useState<string>()
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  // site-contract §3: a step change resets scroll and moves focus to the new step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo?.({ top: 0 })
    heading.current?.focus()
  }, [step])

  const back = () => setStep((current) => current - 1)

  return (
    <div className="flex flex-col gap-(--heading-space-above)">
      <Progress step={step} />

      <div className="flex flex-col gap-(--heading-space-below)">
        {step > 0 && step < 3 ? (
          <div>
            <Button variant="ghost" size="sm" onClick={back}>
              Zurück
            </Button>
          </div>
        ) : null}
        <h1 ref={heading} tabIndex={-1} className="text-grau-dark outline-none">
          {STEPS[step].heading}
        </h1>
      </div>

      {step === 0 ? (
        <EligibilityStep
          initial={eligibility && { ...eligibility, hasDocuments: true }}
          checkEligibility={actions.checkEligibility}
          onEligible={(result) => {
            setEligibility(result)
            setVehicle((current) => ({ ...current, prefix: current.prefix || result.prefix }))
            setStep(1)
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
              setStep(2)
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
            setStep(3)
          }}
        />
      ) : null}

      {step === 3 && reference ? <Confirmation reference={reference} email={vehicle.email} /> : null}
    </div>
  )
}

/** site-contract §2.2/§3: four labelled steps; on phones "Schritt 2 von 4". */
function Progress({ step }: { step: number }) {
  return (
    <nav aria-label="Fortschritt">
      <p className="text-small text-grau-bright md:hidden">
        Schritt {step + 1} von {STEPS.length}: {STEPS[step].title}
      </p>
      <ol className="hidden gap-6 md:flex">
        {STEPS.map((item, index) => (
          <li
            key={item.title}
            aria-current={index === step ? "step" : undefined}
            className={
              index === step
                ? "border-b-2 border-orange pb-2 text-small text-grau-dark"
                : "border-b-2 border-transparent pb-2 text-small text-grau-bright"
            }
          >
            {index + 1}. {item.title}
          </li>
        ))}
      </ol>
    </nav>
  )
}
