"use client"

import type { FormEvent } from "react"
import { Choice } from "@/app/(funnel)/_components/choice"
import { CodeField } from "@/app/_components/code-field"
import { LocatorPhoto } from "@/app/_components/locator-photo"
import { TextField } from "@/app/_components/text-field"
import { Button } from "@/src/ui/button"
import { FieldError } from "@/src/ui/field"
import { RadioGroup } from "@/src/ui/radio-group"
import { ENGINE_CHOICES } from "./registration-data"
import { fieldId, useStepForm, type StepProps } from "./use-step-form"

export function VehicleStep({ data, onChange, onNext }: StepProps) {
  const { errors, set, bind, check } = useStepForm("vehicle", data, onChange)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (check()) onNext()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--field-gap)">
      <TextField
        {...bind("vin", { upper: true })}
        label="Fahrzeug-Identifizierungsnummer (FIN)"
        helper="Feld E im Fahrzeugschein. Bei einem Neuwagen hat sie genau 17 Stellen."
        autoComplete="off"
        spellCheck={false}
        className="sm:max-w-md"
      >
        <LocatorPhoto what="die FIN" />
      </TextField>

      <fieldset id={fieldId("engineType")} tabIndex={-1} aria-describedby={errors.engineType ? "registration-engineType-error" : undefined} className="flex flex-col gap-3 outline-none">
        <legend className="mb-3 text-small font-normal text-grau-dark">Antrieb</legend>
        <RadioGroup value={data.engineType || null} onValueChange={(value) => set("engineType", value as string)}>
          {ENGINE_CHOICES.map(({ value, label }) => (
            <Choice key={value} value={value} label={label} />
          ))}
        </RadioGroup>
        {errors.engineType ? <FieldError id="registration-engineType-error">{errors.engineType}</FieldError> : null}
      </fieldset>

      <TextField
        {...bind("part2Number")}
        label="Teil-II-Nummer"
        helper="Oben auf der Zulassungsbescheinigung Teil II, dem früheren Fahrzeugbrief. Nicht mit der Teil I verwechseln."
        maxLength={20}
        autoComplete="off"
        spellCheck={false}
        className="sm:max-w-md"
      >
        <LocatorPhoto what="die Nummer" />
      </TextField>

      <TextField
        {...bind("part2SecurityCode")}
        label="Teil-II-Sicherheitscode"
        helper="Unter dem Rubbelfeld der Zulassungsbescheinigung Teil II."
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="sm:max-w-md"
        data-1p-ignore
      >
        <LocatorPhoto what="der Code" />
      </TextField>

      <CodeField
        {...bind("evbNumber", { upper: true })}
        label="eVB-Nummer"
        length={7}
        locates="die eVB-Nummer"
        where="Von Ihrer Kfz-Versicherung: sieben Zeichen, meist per E-Mail oder auf dem Versicherungsnachweis."
        type="password"
        autoComplete="off"
        spellCheck={false}
      />

      <div>
        <Button type="submit">Weiter</Button>
      </div>
    </form>
  )
}
