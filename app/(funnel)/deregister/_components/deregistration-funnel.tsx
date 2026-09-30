"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/ui/alert-dialog"
import { Button } from "@/src/ui/button"
import { AvailabilityNotice } from "./availability-notice"
import type { CheckoutActions, PaymentMode } from "./checkout-actions"
import { Confirmation } from "./confirmation"
import { EligibilityStep, type Eligibility } from "./eligibility-step"
import { ReviewStep } from "./review-step"
import { EMPTY_VEHICLE, type VehicleData } from "@/app/_components/vehicle-data"
import { VehicleStep } from "./vehicle-step"

const STEPS = [
  { title: "Voraussetzungen", heading: "Können Sie online abmelden?" },
  { title: "Fahrzeugdaten", heading: "Ihr Fahrzeug" },
  { title: "Prüfen & bezahlen", heading: "Prüfen und bezahlen" },
  { title: "Bestätigung", heading: "Ihr Antrag ist eingegangen" },
] as const

const CONFIRMATION = STEPS.length - 1

/**
 * The de-registration funnel, one step per screen. State lives here, never in
 * the URL (it holds security codes), so going back keeps what was entered.
 * Each step is a history entry holding only its number, so the browser's back
 * button goes back one step (site-contract §3).
 */
export function DeregistrationFunnel({ payment, actions }: { payment: PaymentMode; actions: CheckoutActions }) {
  const [step, setStep] = useState(0)
  const [eligibility, setEligibility] = useState<Eligibility>()
  const [vehicle, setVehicle] = useState<VehicleData>(EMPTY_VEHICLE)
  const [reference, setReference] = useState<string>()
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  const leaveGuard = useLeaveGuard(step > 0 && step < CONFIRMATION)

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, funnelStep: 0 }, "")
  }, [])

  // Once paid, the confirmation stays: going back must not offer the payment again.
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const target = event.state?.funnelStep
      if (typeof target === "number" && reference === undefined) setStep(target)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [reference])

  const goTo = (next: number) => {
    setStep(next)
    window.history.pushState({ funnelStep: next }, "")
  }

  // site-contract §3: a step change resets scroll and moves focus to the new step.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo?.({ top: 0, behavior: "instant" })
    heading.current?.focus()
  }, [step])

  const back = () => window.history.back()

  return (
    <div className="flex flex-col gap-(--heading-space-above)">
      <Progress step={step} />

      <div className="flex flex-col gap-(--heading-space-below)">
        {step > 0 && step < CONFIRMATION ? (
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

      {leaveGuard}
    </div>
  )
}

/**
 * site-contract §3: while something is entered, leaving through a link asks
 * first, and closing or reloading the tab gets the browser's own warning.
 * Links that open a new tab or stay on this page pass untouched.
 */
function useLeaveGuard(active: boolean) {
  const [pending, setPending] = useState<HTMLAnchorElement>()
  const leaving = useRef(false)

  useEffect(() => {
    if (!active) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (leaving.current || !(link instanceof HTMLAnchorElement) || link.target === "_blank") return
      if (link.origin !== window.location.origin || link.pathname === window.location.pathname) return
      event.preventDefault()
      event.stopPropagation()
      setPending(link)
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    document.addEventListener("click", onClick, true)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      document.removeEventListener("click", onClick, true)
    }
  }, [active])

  const leave = () => {
    leaving.current = true
    pending?.click()
    leaving.current = false
    setPending(undefined)
  }

  return (
    <AlertDialog open={pending !== undefined} onOpenChange={(open) => !open && setPending(undefined)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Antrag verlassen?</AlertDialogTitle>
          <AlertDialogDescription>Wenn Sie die Seite jetzt verlassen, gehen Ihre Angaben verloren.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="default">Bleiben</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={leave}>
            Verlassen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
