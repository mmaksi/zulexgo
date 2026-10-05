"use client"

import type { FormEvent } from "react"
import { TextField } from "@/app/_components/text-field"
import { Button } from "@/src/ui/button"
import { useStepForm, type StepProps } from "./use-step-form"

/**
 * site-contract §2.3: the account the vehicle tax is collected from by direct debit. It cannot be
 * corrected once the application is filed, so the IBAN is checked as strictly as it can be. The
 * mandate itself is given with the power of attorney when paying (launch plan Q46, Q54, provisional;
 * the wording is the lawyer's).
 */
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
