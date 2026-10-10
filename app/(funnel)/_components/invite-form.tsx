"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition, type FormEvent } from "react"
import { flushSync } from "react-dom"
import { TextField } from "@/app/_components/text-field"
import { tooManyAttempts } from "@/app/(funnel)/too-many-attempts"
import { useHydrated } from "@/src/hooks/use-hydrated"
import { Alert } from "@/src/ui/alert"
import { Button } from "@/src/ui/button"

export type InviteAnswer =
  | { status: "accepted" }
  | { status: "refused" }
  | { status: "limited"; retryAfterMinutes: number }
  | { status: "unavailable" }

const ASK = "Bitte geben Sie den Einladungscode ein, den Sie von uns erhalten haben."
const REFUSED = "Dieser Code ist nicht gültig. Prüfen Sie ihn auf Tippfehler."

export function InviteForm({ service, action }: { service: string; action: (code: string) => Promise<InviteAnswer> }) {
  const router = useRouter()
  const [answer, setAnswer] = useState<InviteAnswer | { status: "empty" }>()
  const [pending, setPending] = useState(false)
  const [refreshing, startRefresh] = useTransition()
  const field = useRef<HTMLInputElement>(null)
  const hydrated = useHydrated()

  const refuse = (answer: { status: "empty" | "refused" }) => {
    flushSync(() => setAnswer(answer))
    field.current?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const code = String(new FormData(event.currentTarget).get("invite") ?? "")
    if (!code.trim()) return refuse({ status: "empty" })

    setPending(true)
    try {
      const result = await action(code)
      if (result.status === "refused") return refuse(result)
      setAnswer(result)
      if (result.status === "accepted") startRefresh(() => router.refresh())
    } catch {
      setAnswer({ status: "unavailable" })
    } finally {
      setPending(false)
    }
  }

  const error = answer?.status === "empty" ? ASK : answer?.status === "refused" ? REFUSED : undefined

  return (
    <div className="flex flex-col gap-(--heading-space-above)">
      <header className="flex flex-col gap-(--heading-space-below)">
        <h1 className="text-grau-dark">Nur mit Einladung</h1>
        <p className="measure text-body text-grau">
          Die {service} testen wir gerade mit einem kleinen Kreis. Geben Sie den Einladungscode ein, den Sie von uns erhalten haben.
        </p>
      </header>
      <form noValidate method="post" onSubmit={submit} className="measure flex flex-col gap-6">
        <TextField
          id="invite"
          name="invite"
          ref={field}
          label="Einladungscode"
          error={error}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <Button type="submit" disabled={!hydrated || pending || refreshing} className="self-start">
          {pending ? "Wird geprüft …" : "Weiter"}
        </Button>
        {answer?.status === "accepted" && !pending && !refreshing ? (
          <Alert variant="warning" role="alert">
            Ihr Browser hat den Code nicht gespeichert. Bitte erlauben Sie Cookies für diese Seite und versuchen Sie es erneut.
          </Alert>
        ) : null}
        {answer?.status === "limited" ? (
          <Alert variant="warning" role="alert">
            {tooManyAttempts(answer.retryAfterMinutes)}
          </Alert>
        ) : null}
        {answer?.status === "unavailable" ? (
          <Alert variant="error" role="alert">
            Das hat nicht geklappt. Bitte versuchen Sie es in einigen Minuten erneut.
          </Alert>
        ) : null}
      </form>
    </div>
  )
}
