"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import type { OrderChangeState } from "@/app/status/[token]/order-change-state"
import { Alert } from "@/src/ui/alert"
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

export type CancelOrderAction = () => Promise<OrderChangeState>

export function CancelOrder({ action, returned, retained }: { action: CancelOrderAction; returned: string; retained: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<OrderChangeState>()
  const running = useRef(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    if (running.current) return
    running.current = true
    setPending(true)
    setProblem(undefined)
    let state: OrderChangeState
    try {
      state = await action()
    } catch {
      state = { status: "failed" }
    }
    setOpen(false)
    if (state.status === "done" || state.status === "notPossible") router.refresh()
    else setProblem(state)
    running.current = false
    setPending(false)
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Antrag stornieren
      </Button>
      <p className="text-small text-grau">
        Wir behalten {retained} als Bearbeitungsgebühr ein und erstatten Ihnen {returned}.
      </p>
      {problem?.status === "limited" ? (
        <Alert variant="warning" role="alert">
          Zu viele Versuche. Bitte warten Sie {problem.retryAfterMinutes} Minuten und versuchen Sie es dann erneut.
        </Alert>
      ) : null}
      {problem?.status === "failed" ? (
        <Alert variant="error" role="alert">
          Das hat nicht geklappt. Bitte versuchen Sie es in einigen Minuten erneut. Es ist nichts verloren gegangen.
        </Alert>
      ) : null}

      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Antrag stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Wir behalten die Bearbeitungsgebühr von {retained} ein und erstatten Ihnen {returned}. Danach lässt sich dieser Antrag nicht
              mehr korrigieren; für die Abmeldung wäre ein neuer Antrag nötig.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="default" disabled={pending}>
              Nicht stornieren
            </AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={confirm} disabled={pending}>
              {pending ? "Wird storniert …" : "Jetzt stornieren"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
