"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { MESSAGES } from "@/app/(funnel)/register/_components/registration-data"
import { CodeField } from "@/app/_components/code-field"
import { TextField } from "@/app/_components/text-field"
import type { NewRegistrationCorrectionField, OrderChangeState } from "@/app/status/[token]/order-change-state"
import { parseNewRegistrationCorrection } from "@/src/core/domain/application/new-registration-correction"
import { ValidationError } from "@/src/core/errors/validation-error"
import { useHydrated } from "@/src/hooks/use-hydrated"
import { Button } from "@/src/ui/button"
import { ChangeOutcome } from "./change-outcome"

type Field = NewRegistrationCorrectionField
type Values = Record<Field, string>
type Errors = Partial<Record<Field, string>>

export type CorrectNewRegistrationAction = (input: Values) => Promise<OrderChangeState>

const EMPTY: Values = { evbNumber: "", part2Number: "", part2SecurityCode: "", firstName: "", lastName: "", birthDate: "" }
const fieldId = (field: Field) => `correct-${field}`
const NOTHING_CHANGED = "Bitte ändern Sie mindestens eine Angabe."

/**
 * What of the form's values the domain refuses, in the funnel's own words (the rules are the domain's, so the form
 * says no exactly where the server would). `identityVerified` is false only for an order whose identity check found
 * someone else than the owner, which is the one case the name and birth date may still be corrected.
 */
function check(values: Values, ownerCorrectable: boolean): { errors: Errors; general?: string } {
  try {
    parseNewRegistrationCorrection(values, { identityVerified: !ownerCorrectable }, new Date())
    return { errors: {} }
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error
    const errors = Object.fromEntries(error.fields.filter((field): field is Field => field in EMPTY).map((field) => [field, MESSAGES[field]]))
    return { errors, general: error.fields.includes("correction") ? NOTHING_CHANGED : undefined }
  }
}

/**
 * site-contract §2.6, 5b of a Neuzulassung: the fields the service or the identity check can be given again. The eVB
 * number and the Teil II always; the owner's name and birth date only when the identity check found someone else than
 * the owner (`ownerCorrectable`), since once the identity was verified the person was checked against them. It starts
 * empty, so a stored code or name is never put back on the page; a field left blank stays as it was.
 */
export function CorrectNewRegistration({ action, ownerCorrectable }: { action: CorrectNewRegistrationAction; ownerCorrectable: boolean }) {
  const router = useRouter()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [outcome, setOutcome] = useState<OrderChangeState>()
  const [pending, setPending] = useState(false)
  const hydrated = useHydrated()
  const running = useRef(false)
  const focusFirstError = useRef(false)

  const fields: Field[] = ["evbNumber", "part2Number", "part2SecurityCode", ...(ownerCorrectable ? (["firstName", "lastName", "birthDate"] as const) : [])]

  const bind = (field: Field, { upper = false } = {}) => ({
    id: fieldId(field),
    value: values[field],
    error: errors[field],
    onChange: (event: { target: { value: string } }) => {
      setValues((current) => ({ ...current, [field]: upper ? event.target.value.toUpperCase() : event.target.value }))
      setErrors((current) => ({ ...current, [field]: undefined }))
    },
    autoComplete: "off",
    spellCheck: false,
  })

  function show(found: Errors, general?: string) {
    setErrors(found)
    setOutcome(general ? { status: "invalid", errors: found, general } : undefined)
    focusFirstError.current = true
  }

  // A failed submit takes the customer to the first field to fix (design-standard §6.4).
  useEffect(() => {
    if (!focusFirstError.current) return
    focusFirstError.current = false
    const first = fields.find((field) => errors[field])
    if (first) document.getElementById(fieldId(first))?.focus()
  })

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (running.current) return

    const found = check(values, ownerCorrectable)
    if (found.general || Object.keys(found.errors).length > 0) return show(found.errors, found.general)

    running.current = true
    setPending(true)
    setOutcome(undefined)
    let state: OrderChangeState
    try {
      state = await action(values)
    } catch {
      state = { status: "failed" }
    }
    running.current = false
    setPending(false)

    if (state.status === "done" || state.status === "notPossible") return router.refresh()
    if (state.status === "invalid") return show(state.errors as Errors, state.general)
    setOutcome(state)
  }

  const refused = ownerCorrectable
    ? "Ihre Angaben passen noch nicht zu Ihrem Ausweis. Bitte schreiben Sie Name und Geburtsdatum genau so, wie sie im Ausweis stehen."
    : "Der Antrag wurde mit diesen Angaben erneut nicht angenommen. Bitte prüfen Sie Ihre Eingaben noch einmal genau."

  return (
    <form noValidate method="post" onSubmit={submit} className="flex flex-col gap-(--field-gap)">
      <p className="text-body text-grau">Ändern Sie nur, was nicht stimmt. Felder, die Sie leer lassen, bleiben wie sie sind.</p>

      {ownerCorrectable ? (
        <>
          <div className="grid gap-(--field-gap) sm:grid-cols-2">
            <TextField {...bind("firstName")} label="Vorname" autoComplete="given-name" />
            <TextField {...bind("lastName")} label="Nachname" autoComplete="family-name" />
          </div>
          <TextField {...bind("birthDate")} label="Geburtsdatum" type="date" autoComplete="bday" className="sm:max-w-xs" />
        </>
      ) : null}

      <CodeField
        {...bind("evbNumber", { upper: true })}
        label="eVB-Nummer"
        length={7}
        where="Von Ihrer Kfz-Versicherung: sieben Zeichen, meist per E-Mail oder auf dem Versicherungsnachweis."
        type="password"
      />
      <TextField
        {...bind("part2Number")}
        label="Teil-II-Nummer"
        helper="Oben auf der Zulassungsbescheinigung Teil II, dem früheren Fahrzeugbrief."
        maxLength={20}
        className="sm:max-w-md"
      />
      <TextField
        {...bind("part2SecurityCode")}
        label="Teil-II-Sicherheitscode"
        helper="Unter dem Rubbelfeld der Zulassungsbescheinigung Teil II."
        type="password"
        className="sm:max-w-md"
        data-1p-ignore
      />

      <ChangeOutcome state={outcome} refused={refused} />
      <div>
        <Button type="submit" disabled={!hydrated || pending}>
          {pending ? "Wird gesendet …" : "Korrektur absenden"}
        </Button>
      </div>
    </form>
  )
}
