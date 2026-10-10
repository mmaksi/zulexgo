"use client"

import type { FormEvent } from "react"
import { TextField } from "@/app/_components/text-field"
import { Button } from "@/src/ui/button"
import { useStepForm, type StepProps } from "./use-step-form"

// Provisional: launch plan Q46, Q54 (the mandate is given with the power of attorney at payment)
export function TaxStep({ data, onChange, onNext }: StepProps) {
  const { bind, check } = useStepForm("tax", data, onChange)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (check()) onNext()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--field-gap)">
      <p className="measure text-body text-grau">
        Die Kfz-Steuer wird von einem deutschen Konto abgebucht, das auf Sie läuft. Prüfen Sie die Angaben genau: Nach dem Einreichen können
        wir das Konto nicht mehr ändern.
      </p>

      <TextField
        {...bind("iban", { upper: true })}
        label="IBAN"
        helper="Eine deutsche IBAN: DE und 20 Ziffern."
        autoComplete="off"
        spellCheck={false}
        className="sm:max-w-md"
        data-1p-ignore
      />
      <TextField
        {...bind("bic", { upper: true })}
        label="BIC"
        helper="Steht auf Ihrer Bankkarte oder im Online-Banking."
        autoComplete="off"
        spellCheck={false}
        maxLength={11}
        className="sm:max-w-60"
      />
      <TextField {...bind("bankName")} label="Name der Bank" autoComplete="off" className="sm:max-w-md" />

      <div>
        <Button type="submit">Weiter</Button>
      </div>
    </form>
  )
}
