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
  title: string
  heading: string
}

export interface FunnelOrder {
  key: string
  reference: string
  clientSecret: string
}

const FunnelCheckout = createContext<{
  orderFor: (key: string) => FunnelOrder | undefined
  keep: (order: FunnelOrder) => void
  setPaying: (paying: boolean) => void
} | null>(null)

export function useFunnelCheckout() {
  const checkout = useContext(FunnelCheckout)
  if (!checkout) throw new Error("The checkout is part of a funnel: render it inside FunnelFrame")
  return checkout
}

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
