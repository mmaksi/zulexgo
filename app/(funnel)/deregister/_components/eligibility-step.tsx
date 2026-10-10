"use client"

import { useState, type FormEvent } from "react"
import { flushSync } from "react-dom"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { Button } from "@/src/ui/button"
import { RadioGroup } from "@/src/ui/radio-group"
import type { CheckoutActions } from "./checkout-actions"
import { Choice } from "@/app/(funnel)/_components/choice"
import { TextField } from "@/app/_components/text-field"
import type { PlateCount } from "@/app/_components/vehicle-data"
import { Alert } from "@/src/ui/alert"
import { Checkbox } from "@/src/ui/checkbox"
import { tooManyAttempts } from "@/app/(funnel)/too-many-attempts"

const PREFIX_ID = "eligibility-prefix"
const UNREACHABLE = "Die Zulassungsstelle ist gerade nicht zu erreichen. Bitte versuchen Sie es in ein paar Minuten noch einmal."

export interface Eligibility {
  plateCount: PlateCount
  prefix: string
  ikfzStatus: IkfzStatus
}

export function EligibilityStep({
  initial,
  checkEligibility,
  onEligible,
}: {
  initial?: Partial<Eligibility> & { hasDocuments?: boolean }
  checkEligibility: CheckoutActions["checkEligibility"]
  onEligible: (eligibility: Eligibility) => void
}) {
  const [plateCount, setPlateCount] = useState<PlateCount | undefined>(initial?.plateCount)
  const [hasDocuments, setHasDocuments] = useState<boolean | undefined>(initial?.hasDocuments)
  const [prefix, setPrefix] = useState(initial?.prefix ?? "")
  const [specialPlate, setSpecialPlate] = useState(false)
  const [error, setError] = useState<string>()
  const [checking, setChecking] = useState(false)

  const refuse = (message: string) => {
    flushSync(() => setError(message))
    document.getElementById(PREFIX_ID)?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!plateCount || hasDocuments !== true || checking) return
    setChecking(true)
    try {
      const result = await checkEligibility(prefix)
      if (result.ok) return onEligible({ plateCount, prefix: result.prefix, ikfzStatus: result.ikfzStatus })
      if (result.reason === "limited") refuse(tooManyAttempts(result.retryAfterMinutes))
      else if (result.reason === "invalidPrefix")
        refuse("Für dieses Ortskürzel finden wir keine Zulassungsstelle. Prüfen Sie die 1 bis 3 Buchstaben vor dem ersten Leerzeichen.")
      else refuse(UNREACHABLE)
    } catch {
      refuse(UNREACHABLE)
    } finally {
      setChecking(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--field-gap)">
      <p className="measure text-body text-grau">
        Sie brauchen Ihren Fahrzeugschein (Zulassungsbescheinigung Teil I) und die Kennzeichen mit unbeschädigten
        Plaketten. Unter den Rubbelfeldern stehen die Sicherheitscodes, mit denen Sie die Abmeldung bestätigen.
      </p>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-small font-normal text-grau-dark">Wie viele Kennzeichen hat Ihr Fahrzeug?</legend>
        <RadioGroup value={plateCount ?? null} onValueChange={(value) => setPlateCount(value as PlateCount)}>
          <Choice value={2} label="Zwei Kennzeichen (vorne und hinten), z. B. Auto" />
          <Choice value={1} label="Ein Kennzeichen (nur hinten), z. B. Motorrad oder Anhänger" />
        </RadioGroup>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-small font-normal text-grau-dark">
          Liegen Ihnen der Fahrzeugschein und die Kennzeichen mit Plaketten vor?
        </legend>
        <RadioGroup value={hasDocuments ?? null} onValueChange={(value) => setHasDocuments(value as boolean)}>
          <Choice value={true} label="Ja, beides liegt mir vor" />
          <Choice value={false} label="Nein" />
        </RadioGroup>
      </fieldset>

      {hasDocuments === false ? (
        <Alert role="status" variant="warning" className="measure">
          Ohne Fahrzeugschein und Plaketten mit Sicherheitscode ist die Online-Abmeldung nicht möglich. Sie können Ihr
          Fahrzeug aber bei Ihrer Zulassungsstelle vor Ort abmelden.
        </Alert>
      ) : null}

      <TextField
        id={PREFIX_ID}
        label="Ortskürzel Ihres Kennzeichens"
        helper="Die Buchstaben vor dem ersten Leerzeichen, z. B. „B“ bei B AB 123."
        error={error}
        value={prefix}
        onChange={(event) => {
          setPrefix(event.target.value.toUpperCase())
          setError(undefined)
        }}
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={3}
        className="max-w-60"
      />

      {/* Provisional: launch plan J11, a request cannot say E, H or seasonal. */}
      <label className="measure flex cursor-pointer items-start gap-3 text-body text-grau-dark">
        <Checkbox checked={specialPlate} onCheckedChange={(value) => setSpecialPlate(value === true)} />
        <span>Mein Kennzeichen ist ein E-, H- oder Saisonkennzeichen.</span>
      </label>
      {specialPlate ? (
        <Alert role="status" variant="warning" className="measure">
          Für E-, H- und Saisonkennzeichen ist noch nicht geklärt, ob das KBA den Antrag annimmt. Er kann abgelehnt werden. Sie können
          trotzdem fortfahren.
        </Alert>
      ) : null}

      <div>
        <Button type="submit" disabled={!plateCount || hasDocuments !== true || !prefix || checking}>
          {checking ? "Wird geprüft …" : "Weiter"}
        </Button>
      </div>
    </form>
  )
}
