"use client"

import { useState, type FormEvent } from "react"
import type { IkfzStatus } from "@/src/core/domain/registration-authority"
import { Button } from "@/src/ui/button"
import { RadioGroup, RadioGroupItem } from "@/src/ui/radio-group"
import type { CheckoutActions } from "./checkout-actions"
import { TextField } from "@/app/_components/text-field"
import type { PlateCount } from "@/app/_components/vehicle-data"
import { Alert } from "@/src/ui/alert"
import { Checkbox } from "@/src/ui/checkbox"

export interface Eligibility {
  plateCount: PlateCount
  prefix: string
  ikfzStatus: IkfzStatus
}

/** site-contract §2.2: stops an ineligible customer before any effort or money. */
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

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!plateCount || hasDocuments !== true) return
    setChecking(true)
    const result = await checkEligibility(prefix)
    setChecking(false)
    if (!result.ok) {
      setError(
        result.reason === "invalidPrefix"
          ? "Für dieses Ortskürzel finden wir keine Zulassungsstelle. Prüfen Sie die 1 bis 3 Buchstaben vor dem ersten Leerzeichen."
          : "Die Zulassungsstelle ist gerade nicht zu erreichen. Bitte versuchen Sie es in ein paar Minuten noch einmal.",
      )
      return
    }
    onEligible({ plateCount, prefix: result.prefix, ikfzStatus: result.ikfzStatus })
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
        id="eligibility-prefix"
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

      {/* Launch plan J11: a de-registration request cannot say E, H or seasonal, and the provider has not said whether such plates go through. */}
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

function Choice<Value>({ value, label }: { value: Value; label: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-body text-grau-dark">
      <RadioGroupItem value={value} />
      {label}
    </label>
  )
}
