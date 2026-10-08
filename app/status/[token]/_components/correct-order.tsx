"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { CodeField } from "@/app/_components/code-field"
import { TextField } from "@/app/_components/text-field"
import { validateField } from "@/app/_components/vehicle-data"
import type { DeregistrationCorrectionField as CorrectionField, OrderChangeState } from "@/app/status/[token]/order-change-state"
import { useHydrated } from "@/src/hooks/use-hydrated"
import { Button } from "@/src/ui/button"
import { ChangeOutcome } from "./change-outcome"

type Values = Record<CorrectionField, string>
type Errors = Partial<Record<CorrectionField, string>>

export type CorrectOrderAction = (input: Values) => Promise<OrderChangeState>

const EMPTY: Values = { vin: "", rearPlate: "", frontPlate: "", certificate: "" }
const MODERN_VIN_LENGTH = 17
const fieldId = (field: CorrectionField) => `correct-${field}`

/**
 * site-contract §2.6, 5b: the fields the service can be given again, the front
 * code only for two plates. It starts empty, so a stored security code is never
 * put back on the page; a field left blank stays as it was. The plate is not
 * here: a different plate is a different vehicle, so a new order.
 */
export function CorrectOrder({ action, plateCount }: { action: CorrectOrderAction; plateCount: 1 | 2 }) {
  const router = useRouter()
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [outcome, setOutcome] = useState<OrderChangeState>()
  const [pending, setPending] = useState(false)
  const hydrated = useHydrated()
  const running = useRef(false)
  const focusFirstError = useRef(false)

  const fields: CorrectionField[] = ["vin", "rearPlate", ...(plateCount === 2 ? (["frontPlate"] as const) : []), "certificate"]

  const bind = (field: CorrectionField) => ({
    id: fieldId(field),
    value: values[field],
    error: errors[field],
    onChange: (event: { target: { value: string } }) => {
      setValues((current) => ({ ...current, [field]: event.target.value.toUpperCase() }))
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

    const filled = fields.filter((field) => values[field].trim())
    const found: Errors = {}
    for (const field of filled) {
      const message = validateField(field, values[field])
      if (message) found[field] = message
    }
    if (filled.length === 0) return show(found, "Bitte ändern Sie mindestens eine Angabe.")
    if (Object.keys(found).length > 0) return show(found)

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
    if (state.status === "invalid") return show(state.errors, state.general)
    setOutcome(state)
  }

  const vinWarning =
    values.vin && values.vin.length !== MODERN_VIN_LENGTH
      ? "Die FIN neuerer Fahrzeuge hat 17 Stellen. Bei älteren Fahrzeugen kann sie kürzer sein."
      : undefined

  return (
    <form noValidate method="post" onSubmit={submit} className="flex flex-col gap-(--field-gap)">
      <p className="text-body text-grau">Ändern Sie nur, was nicht stimmt. Felder, die Sie leer lassen, bleiben wie sie sind.</p>

      <TextField
        {...bind("vin")}
        label="Fahrzeug-Identifizierungsnummer (FIN)"
        helper="Feld E im Fahrzeugschein."
        warning={vinWarning}
        maxLength={MODERN_VIN_LENGTH}
        className="sm:max-w-md"
      />
      <CodeField {...bind("rearPlate")} label="Sicherheitscode hinteres Kennzeichen" length={3} where="Unter dem Rubbelfeld der Plakette auf dem hinteren Kennzeichen." />
      {plateCount === 2 ? (
        <CodeField {...bind("frontPlate")} label="Sicherheitscode vorderes Kennzeichen" length={3} where="Unter dem Rubbelfeld der Plakette auf dem vorderen Kennzeichen." />
      ) : null}
      <CodeField
        {...bind("certificate")}
        label="Sicherheitscode Fahrzeugschein"
        length={7}
        where="Unter dem Rubbelfeld auf der Vorderseite des Fahrzeugscheins (Teil I)."
        type="password"
      />

      <ChangeOutcome state={outcome} refused="Der Antrag wurde mit diesen Angaben erneut nicht angenommen. Bitte prüfen Sie Ihre Eingaben noch einmal genau." />
      <div>
        <Button type="submit" disabled={!hydrated || pending}>
          {pending ? "Wird gesendet …" : "Erneut einreichen"}
        </Button>
      </div>
    </form>
  )
}
