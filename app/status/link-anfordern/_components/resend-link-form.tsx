"use client"

import { useState, type FormEvent } from "react"
import { flushSync } from "react-dom"
import { TextField } from "@/app/_components/text-field"
import type { ResendFormState } from "@/app/status/link-anfordern/resend-form-state"
import { useHydrated } from "@/src/hooks/use-hydrated"
import { Alert } from "@/src/ui/alert"
import { Button } from "@/src/ui/button"

export type ResendLinkAction = (input: { reference: string; email: string }) => Promise<ResendFormState>

const FIELDS = ["reference", "email"] as const
const fieldId = (field: (typeof FIELDS)[number]) => `resend-${field}`

/** site-contract §3: the recovery for a lost link; the answer never says whether the order exists. */
export function ResendLinkForm({ action }: { action: ResendLinkAction }) {
  const [state, setState] = useState<ResendFormState>()
  const [pending, setPending] = useState(false)
  const hydrated = useHydrated()
  const errors = state?.status === "invalid" ? state.errors : {}

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const data = new FormData(event.currentTarget)
    setPending(true)
    try {
      const answer = await action({ reference: String(data.get("reference") ?? ""), email: String(data.get("email") ?? "") })
      if (answer.status !== "invalid") return setState(answer)
      // The errors have no live role, so they are rendered before focus moves to the first, which then announces it.
      flushSync(() => setState(answer))
      const first = FIELDS.find((field) => answer.errors[field])
      if (first) document.getElementById(fieldId(first))?.focus()
    } catch {
      setState({ status: "unavailable" })
    } finally {
      setPending(false)
    }
  }

  return (
    <form noValidate method="post" onSubmit={submit} className="measure flex flex-col gap-6">
      <TextField
        id={fieldId("reference")}
        name="reference"
        label="Auftragsnummer"
        helper="Sie steht in Ihrer E-Mail von ZulexGO, zum Beispiel ZG-ABC123."
        error={errors.reference}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
      />
      <TextField
        id={fieldId("email")}
        name="email"
        type="email"
        inputMode="email"
        label="E-Mail-Adresse"
        helper="Die Adresse, die Sie beim Antrag angegeben haben."
        error={errors.email}
        autoComplete="email"
      />
      <Button type="submit" disabled={!hydrated || pending} className="self-start">
        {pending ? "Wird gesendet …" : "Link senden"}
      </Button>
      <Outcome state={state} />
    </form>
  )
}

function Outcome({ state }: { state?: ResendFormState }) {
  if (state?.status === "accepted") {
    return (
      <Alert role="status">
        Wenn Auftragsnummer und E-Mail-Adresse zusammenpassen, ist ein neuer Link unterwegs. Schauen Sie auch im Spam-Ordner nach. Der
        bisherige Link ist dann nicht mehr gültig.
      </Alert>
    )
  }
  if (state?.status === "limited") {
    return (
      <Alert variant="warning" role="alert">
        Zu viele Versuche. Bitte warten Sie {state.retryAfterMinutes} Minuten und versuchen Sie es dann erneut.
      </Alert>
    )
  }
  if (state?.status === "unavailable") {
    return (
      <Alert variant="error" role="alert">
        Das hat nicht geklappt. Bitte versuchen Sie es in einigen Minuten erneut.
      </Alert>
    )
  }
  return null
}
