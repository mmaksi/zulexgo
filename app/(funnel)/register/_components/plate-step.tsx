"use client"

import type { FormEvent } from "react"
import { Alert } from "@/src/ui/alert"
import { Button } from "@/src/ui/button"
import { Checkbox } from "@/src/ui/checkbox"
import { NativeSelectOption } from "@/src/ui/native-select"
import { SelectField } from "@/app/_components/select-field"
import { MONTH_NAMES } from "./registration-data"
import { fieldId, useStepForm, type StepProps } from "./use-step-form"

/**
 * site-contract §2.3: the plate is assigned by the authority (launch plan Q51, provisional: no wish
 * plate), so there is little to choose: an E-plate for an electric car, and a season if the car is
 * not used all year.
 */
export function PlateStep({ data, onChange, onNext }: StepProps) {
  const { errors, set, check } = useStepForm("plate", data, onChange)
  const electric = data.engineType === "electric"

  function submit(event: FormEvent) {
    event.preventDefault()
    if (check()) onNext()
  }

  const month = (field: "seasonFrom" | "seasonUntil", label: string) => (
    <SelectField
      id={fieldId(field)}
      label={label}
      error={errors[field]}
      value={data[field]}
      onChange={(event) => set(field, event.target.value)}
      className="sm:max-w-60"
    >
      <NativeSelectOption value="">Monat wählen</NativeSelectOption>
      {MONTH_NAMES.map((name, index) => (
        <NativeSelectOption key={name} value={String(index + 1)}>
          {name}
        </NativeSelectOption>
      ))}
    </SelectField>
  )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--field-gap)">
      <p className="measure text-body text-grau">
        Ihr Kennzeichen vergibt die Zulassungsstelle, wir können es nicht für Sie aussuchen. Wunschkennzeichen bieten wir derzeit nicht an.
      </p>

      {electric ? (
        <label className="measure flex cursor-pointer items-start gap-3 text-body text-grau-dark">
          <Checkbox checked={data.electric} onCheckedChange={(value) => set("electric", value === true)} />
          <span>Ich möchte ein E-Kennzeichen für mein Elektrofahrzeug.</span>
        </label>
      ) : null}

      <label className="measure flex cursor-pointer items-start gap-3 text-body text-grau-dark">
        <Checkbox checked={data.seasonal} onCheckedChange={(value) => set("seasonal", value === true)} />
        <span>Ich möchte ein Saisonkennzeichen.</span>
      </label>

      {data.seasonal ? (
        <>
          <Alert role="status" className="measure">
            Mit einem Saisonkennzeichen darf das Fahrzeug nur in den gewählten Monaten gefahren werden.
          </Alert>
          <div className="grid gap-(--field-gap) sm:grid-cols-2">
            {month("seasonFrom", "Erster Monat der Saison")}
            {month("seasonUntil", "Letzter Monat der Saison")}
          </div>
        </>
      ) : null}

      <div>
        <Button type="submit">Weiter</Button>
      </div>
    </form>
  )
}
