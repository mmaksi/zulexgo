"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
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

export interface FunnelStep {
  /** The label in the progress indicator, site-contract §2.2: at most 20 characters. */
  title: string
  /** The page's h1 on this step. */
  heading: string
}

/** An order the checkout opened, with the data it was opened for, as `CheckoutPanel` keys it. */
export interface FunnelOrder {
  key: string
  reference: string
  clientSecret: string
}

/**
 * What the checkout needs from the frame, which outlives every step: the order it opened, so coming
 * back to the payment with the same data pays that order instead of opening a second, and a lock on
 * going back while a payment runs.
 */
const FunnelCheckout = createContext<{
  /** The order opened for `key`, if the last one was. */
  orderFor: (key: string) => FunnelOrder | undefined
  keep: (order: FunnelOrder) => void
  setPaying: (paying: boolean) => void
} | null>(null)

export function useFunnelCheckout() {
  const checkout = useContext(FunnelCheckout)
  if (!checkout) throw new Error("The checkout is part of a funnel: render it inside FunnelFrame")
  return checkout
}

/**
 * What every funnel shares: one step per screen, the last being the confirmation. A funnel keeps
 * its own data, never in the URL (it holds codes and personal details), so going back keeps what was
 * entered. The frame owns where the customer is: each step is a history entry holding only its
 * number, so the browser's back button goes back one step (site-contract §3). `paid` locks the
 * confirmation in: once the order is paid, going back must not offer the payment again. While a
 * payment runs the customer stays on it too, so its form cannot be torn down half-way.
 */
export function FunnelFrame({
  steps,
  paid,
  children,
}: {
  steps: readonly FunnelStep[]
  paid: boolean
  children: (navigation: { step: number; goTo: (step: number) => void }) => ReactNode
}) {
  const [step, setStep] = useState(0)
  const [paying, setPaying] = useState(false)
  const order = useRef<FunnelOrder | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  const confirmation = steps.length - 1
  const entering = step > 0 && step < confirmation

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, funnelStep: 0 }, "")
  }, [])

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const target = event.state?.funnelStep
      if (typeof target !== "number" || paid) return
      // The browser has already moved back: put the payment's entry back, so a later "Zurück" still lands one step back.
      if (paying) window.history.pushState({ funnelStep: step }, "")
      else setStep(target)
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [paid, paying, step])

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

  return (
    <div className="flex flex-col gap-(--heading-space-above)">
      <Progress steps={steps} step={step} />

      <div className="flex flex-col gap-(--heading-space-below)">
        {entering ? (
          <div>
            <Button variant="ghost" size="sm" disabled={paying} onClick={() => window.history.back()}>
              Zurück
            </Button>
          </div>
        ) : null}
        <h1 ref={heading} tabIndex={-1} className="text-grau-dark outline-none">
          {steps[step].heading}
        </h1>
      </div>

      <FunnelCheckout.Provider
        value={{
          orderFor: (key) => (order.current?.key === key ? order.current : undefined),
          keep: (opened) => {
            order.current = opened
          },
          setPaying,
        }}
      >
        {children({ step, goTo })}
      </FunnelCheckout.Provider>

      <LeaveGuard active={entering} />
    </div>
  )
}

/**
 * site-contract §3: while something is entered, leaving through a link asks
 * first, and closing or reloading the tab gets the browser's own warning.
 * Links that open a new tab or stay on this page pass untouched.
 */
function LeaveGuard({ active }: { active: boolean }) {
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

/**
 * site-contract §2.2/§3: labelled steps; on phones "Schritt 2 von 4". A funnel of more than five steps
 * has too many labels for a tablet's row, so it keeps the short form until the laptop width.
 */
function Progress({ steps, step }: { steps: readonly FunnelStep[]; step: number }) {
  const long = steps.length > 5
  return (
    <nav aria-label="Fortschritt">
      <p className={long ? "text-small text-grau-bright lg:hidden" : "text-small text-grau-bright md:hidden"}>
        Schritt {step + 1} von {steps.length}: {steps[step].title}
      </p>
      <ol className={long ? "hidden gap-6 lg:flex" : "hidden gap-6 md:flex"}>
        {steps.map((item, index) => (
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
