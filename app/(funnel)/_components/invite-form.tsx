"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react"
import { TextField } from "@/app/_components/text-field"
import { tooManyAttempts } from "@/app/(funnel)/too-many-attempts"
import { Alert } from "@/src/ui/alert"
import { Button } from "@/src/ui/button"

export type InviteAnswer =
  | { status: "accepted" }
  | { status: "refused" }
  | { status: "limited"; retryAfterMinutes: number }
  | { status: "unavailable" }

const noSubscription = () => () => undefined

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
  const [refreshing, startRefresh] = useTransition()
  const field = useRef<HTMLInputElement>(null)
  // False in the server's HTML and until the page has hydrated: the button stays off, so the browser's own
  // submit never sends the code as a query string (a blocked or failing script leaves it off for good).
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false)

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
      if (result.status === "accepted") startRefresh(() => router.refresh())
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
          // The page has loaded again and still asks: the server took the code and the browser did not keep it.
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
