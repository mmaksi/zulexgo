"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, type FormEvent } from "react"
import { TextField } from "@/app/_components/text-field"
import { tooManyAttempts } from "@/app/(funnel)/too-many-attempts"
import { Alert } from "@/src/ui/alert"
import { Button } from "@/src/ui/button"

export type InviteAnswer =
  | { status: "accepted" }
  | { status: "refused" }
  | { status: "limited"; retryAfterMinutes: number }
  | { status: "unavailable" }

const ASK = "Bitte geben Sie den Einladungscode ein, den Sie von uns erhalten haben."
const REFUSED = "Dieser Code ist nicht gültig. Prüfen Sie ihn auf Tippfehler."

/**
 * What a visitor sees in place of a funnel while its service is in beta: one field for the invite code.
 * Once the code is accepted the server keeps it for the browser, and the page loads again with the
 * funnel in its place.
 */
export function InviteForm({ service, action }: { service: string; action: (code: string) => Promise<InviteAnswer> }) {
  const router = useRouter()
  const [answer, setAnswer] = useState<InviteAnswer | { status: "empty" }>()
  const [pending, setPending] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const code = String(new FormData(event.currentTarget).get("invite") ?? "")
    if (!code.trim()) {
      setAnswer({ status: "empty" })
      return field.current?.focus()
    }

    setPending(true)
    try {
      const result = await action(code)
      setAnswer(result)
      if (result.status === "accepted") router.refresh()
      if (result.status === "refused") field.current?.focus()
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
      <form noValidate onSubmit={submit} className="measure flex flex-col gap-6">
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
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Wird geprüft …" : "Weiter"}
        </Button>
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
