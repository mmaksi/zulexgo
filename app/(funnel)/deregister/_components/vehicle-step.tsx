"use client"

import { useState, type FormEvent } from "react"
import { flushSync } from "react-dom"
import { Button } from "@/src/ui/button"
import { PlateFrame } from "@/src/ui/plate-frame"
import { TextField } from "@/app/_components/text-field"
import { CodeField } from "@/app/_components/code-field"
import { fieldsFor, validateVehicle, type PlateCount, type VehicleData, type VehicleField } from "@/app/_components/vehicle-data"

const MODERN_VIN_LENGTH = 17

const fieldId = (field: VehicleField) => `vehicle-${field}`

export function VehicleStep({
  plateCount,
  initial,
  onNext,
}: {
  plateCount: PlateCount
  initial: VehicleData
  onNext: (data: VehicleData) => void
}) {
  const [data, setData] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<VehicleField, string>>>({})

  const bind = (field: VehicleField, { upper = true } = {}) => ({
    id: fieldId(field),
    value: data[field],
    error: errors[field],
    onChange: (event: { target: { value: string } }) => {
      const value = upper ? event.target.value.toUpperCase() : event.target.value
      setData((current) => ({ ...current, [field]: value }))
      setErrors((current) => ({ ...current, [field]: undefined }))
    },
    autoComplete: "off",
    spellCheck: false,
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const found = validateVehicle(data, plateCount)
    // Rendered before focus moves, so the field announces its error as it is focused.
    flushSync(() => setErrors(found))
    const firstInvalid = fieldsFor(plateCount).find((field) => found[field])
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus()
      return
    }
    onNext(data)
  }

  const vinWarning =
    data.vin && data.vin.length !== MODERN_VIN_LENGTH
      ? "Die FIN neuerer Fahrzeuge hat 17 Stellen. Bei älteren Fahrzeugen kann sie kürzer sein."
      : undefined

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--field-gap)">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-small font-normal text-grau-dark">Kennzeichen</legend>
        <PlateFrame className="sm:max-w-md">
          <div className="grid grid-cols-[1fr_1fr_1.4fr] gap-2 p-2">
            <TextField {...bind("prefix")} label="Ortskürzel" maxLength={3} inputClassName="plate-text" />
            <TextField {...bind("letters")} label="Buchstaben" maxLength={2} inputClassName="plate-text" />
            <TextField {...bind("numbers")} label="Ziffern" maxLength={4} inputMode="numeric" inputClassName="plate-text" />
          </div>
        </PlateFrame>
      </fieldset>

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

      <TextField
        {...bind("email", { upper: false })}
        label="E-Mail-Adresse"
        helper="Hierhin schicken wir Ihren persönlichen Statuslink und jede Neuigkeit zu Ihrem Antrag."
        type="email"
        inputMode="email"
        autoComplete="email"
        className="sm:max-w-md"
      />

      <div>
        <Button type="submit">Weiter</Button>
      </div>
    </form>
  )
}
