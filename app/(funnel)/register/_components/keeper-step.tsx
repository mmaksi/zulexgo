"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Choice } from "@/app/(funnel)/_components/choice"
import { TextField } from "@/app/_components/text-field"
import { Button } from "@/src/ui/button"
import { FieldError } from "@/src/ui/field"
import { RadioGroup } from "@/src/ui/radio-group"
import type { RegistrationEligibility } from "./requirements-step"
import type { RegistrationActions } from "./registration-actions"
import { fieldId, useStepForm, type StepProps } from "./use-step-form"

const UNREACHABLE = "Die Zulassungsstelle ist gerade nicht zu erreichen. Bitte versuchen Sie es in ein paar Minuten noch einmal."

/**
 * site-contract §2.3: who the car is registered to. The postcode picked the authority in the first
 * step; if the customer changes it here, the authority is asked again, so the processing-time notice
 * is never about another town than the one on the order.
 */
export function KeeperStep({
  data,
  onChange,
  eligibility,
  checkEligibility,
  onNext,
}: Omit<StepProps, "onNext"> & {
  eligibility: RegistrationEligibility
  checkEligibility: RegistrationActions["checkEligibility"]
  onNext: (eligibility: RegistrationEligibility) => void
}) {
  const { errors, set, setErrors, bind, check } = useStepForm("keeper", data, onChange)
  const [checking, setChecking] = useState(false)
  // The check is a round trip the customer can leave during (by going back): its answer then means nothing here.
  const here = useRef(true)
  useEffect(() => {
    here.current = true
    return () => {
      here.current = false
    }
  }, [])

  const refuse = (postcode: string) => {
    setErrors({ postcode })
    document.getElementById(fieldId("postcode"))?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (checking || !check()) return
    // The postcode is the same one the authority was found for: nothing to ask again.
    if (data.postcode.trim() === eligibility.postcode) return onNext(eligibility)

    setChecking(true)
    try {
      const result = await checkEligibility(data.postcode)
      if (!here.current) return
      if (result.ok) return onNext({ postcode: result.postcode, ikfzStatus: result.ikfzStatus })
      refuse(result.reason === "invalidPostcode" ? "Für diese Postleitzahl finden wir keine Zulassungsstelle. Prüfen Sie die 5 Ziffern." : UNREACHABLE)
    } catch {
      if (here.current) refuse(UNREACHABLE)
    } finally {
      if (here.current) setChecking(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--field-gap)">
      <p className="measure text-body text-grau">
        Der Halter ist die Person, auf die das Fahrzeug zugelassen wird. Das sind Sie. Wir geben Ihre Angaben an die Zulassungsstelle weiter,
        und die schickt Ihnen die Zulassungsunterlagen an die Adresse, die Sie hier angeben.
      </p>

      <div className="grid gap-(--field-gap) sm:grid-cols-2">
        <TextField {...bind("firstName")} label="Vorname" autoComplete="given-name" />
        <TextField {...bind("lastName")} label="Nachname" autoComplete="family-name" />
      </div>

      <fieldset id="registration-gender" tabIndex={-1} aria-describedby={errors.gender ? "registration-gender-error" : undefined} className="flex flex-col gap-3 outline-none">
        <legend className="mb-3 text-small font-normal text-grau-dark">Geschlecht</legend>
        <RadioGroup value={data.gender || null} onValueChange={(value) => set("gender", value as string)}>
          <Choice value="female" label="Weiblich" />
          <Choice value="male" label="Männlich" />
          <Choice value="diverse" label="Divers" />
          <Choice value="unspecified" label="Keine Angabe" />
        </RadioGroup>
        {errors.gender ? <FieldError id="registration-gender-error">{errors.gender}</FieldError> : null}
      </fieldset>

      <div className="grid gap-(--field-gap) sm:grid-cols-2">
        <TextField {...bind("birthDate")} label="Geburtsdatum" type="date" autoComplete="bday" />
        <TextField {...bind("birthPlace")} label="Geburtsort" autoComplete="off" />
      </div>

      <div className="grid gap-(--field-gap) sm:grid-cols-[1fr_8rem]">
        <TextField {...bind("street")} label="Straße" autoComplete="address-line1" />
        <TextField {...bind("houseNumber")} label="Hausnummer" autoComplete="off" />
      </div>
      <div className="grid gap-(--field-gap) sm:grid-cols-[8rem_1fr]">
        <TextField {...bind("postcode")} label="Postleitzahl" autoComplete="postal-code" inputMode="numeric" maxLength={5} />
        <TextField {...bind("city")} label="Ort" autoComplete="address-level2" />
      </div>

      <TextField
        {...bind("phone")}
        label="Telefonnummer"
        helper="Falls die Zulassungsstelle eine Rückfrage hat."
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        className="sm:max-w-md"
      />
      <TextField
        {...bind("email")}
        label="E-Mail-Adresse"
        helper="Hierhin schicken wir Ihren persönlichen Statuslink, den Link zur Identitätsprüfung und jede Neuigkeit zu Ihrem Antrag."
        type="email"
        inputMode="email"
        autoComplete="email"
        className="sm:max-w-md"
      />

      <div>
        <Button type="submit" disabled={checking}>
          {checking ? "Wird geprüft …" : "Weiter"}
        </Button>
      </div>
    </form>
  )
}
