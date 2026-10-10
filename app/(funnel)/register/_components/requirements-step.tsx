"use client"

import { useState, type FormEvent } from "react"
import { flushSync } from "react-dom"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { Choice } from "@/app/(funnel)/_components/choice"
import { TextField } from "@/app/_components/text-field"
import { Alert } from "@/src/ui/alert"
import { Button } from "@/src/ui/button"
import { RadioGroup } from "@/src/ui/radio-group"
import { failureWording, UNREACHABLE } from "./eligibility-failure"
import type { RegistrationActions } from "./registration-actions"

export interface RegistrationEligibility {
  postcode: string
  ikfzStatus: IkfzStatus
}

// Provisional: launch plan Q49 (what an online registration requires)
const REQUIREMENTS = [
  {
    key: "newCar",
    question: "Ist Ihr Fahrzeug ein fabrikneuer Pkw, der noch nie zugelassen war?",
    stop: "Online zulassen können wir nur fabrikneue Pkw. Gebrauchte oder schon einmal zugelassene Fahrzeuge, Motorräder und Anhänger melden Sie bei Ihrer Zulassungsstelle an.",
  },
  {
    key: "part2",
    question: "Haben Sie die Zulassungsbescheinigung Teil II mit dem Sicherheitscode unter dem Rubbelfeld?",
    stop: "Ohne die Zulassungsbescheinigung Teil II mit Sicherheitscode geht es online nicht. Fragen Sie Ihren Händler danach, oder lassen Sie das Fahrzeug bei Ihrer Zulassungsstelle zu.",
  },
  {
    key: "evb",
    question: "Haben Sie die eVB-Nummer Ihrer Kfz-Versicherung?",
    stop: "Die eVB-Nummer bekommen Sie von Ihrer Kfz-Versicherung, meist sofort per E-Mail. Kommen Sie zu uns zurück, sobald Sie sie haben.",
  },
  {
    key: "keeper",
    question: "Sind Sie Privatperson, mindestens 18 Jahre alt, wohnen Sie in Deutschland und werden Sie selbst Halter des Fahrzeugs?",
    stop: "Online zulassen wir nur für Privatpersonen ab 18 Jahren mit Wohnsitz in Deutschland, die das Fahrzeug selbst halten. Alles andere erledigt Ihre Zulassungsstelle.",
  },
  {
    key: "bank",
    question: "Haben Sie ein deutsches Bankkonto, von dem die Kfz-Steuer abgebucht werden darf?",
    stop: "Die Kfz-Steuer wird per Lastschrift von einem deutschen Konto abgebucht, das auf Sie läuft. Ohne eine deutsche IBAN wenden Sie sich an Ihre Zulassungsstelle.",
  },
] as const

type Requirement = (typeof REQUIREMENTS)[number]["key"]

const POSTCODE_ID = "eligibility-postcode"

export function RequirementsStep({
  initialPostcode,
  checkEligibility,
  onEligible,
}: {
  initialPostcode?: string
  checkEligibility: RegistrationActions["checkEligibility"]
  onEligible: (eligibility: RegistrationEligibility) => void
}) {
  const [answers, setAnswers] = useState<Partial<Record<Requirement, boolean>>>(
    initialPostcode ? Object.fromEntries(REQUIREMENTS.map(({ key }) => [key, true])) : {},
  )
  const [postcode, setPostcode] = useState(initialPostcode ?? "")
  const [error, setError] = useState<string>()
  const [checking, setChecking] = useState(false)
  const ready = REQUIREMENTS.every(({ key }) => answers[key] === true) && postcode.trim() !== ""

  const refuse = (message: string) => {
    flushSync(() => setError(message))
    document.getElementById(POSTCODE_ID)?.focus()
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!ready || checking) return
    setChecking(true)
    try {
      const result = await checkEligibility(postcode)
      if (!result.ok) {
        refuse(failureWording(result))
        return
      }
      onEligible({ postcode: result.postcode, ikfzStatus: result.ikfzStatus })
    } catch {
      refuse(UNREACHABLE)
    } finally {
      setChecking(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--field-gap)">
      <p className="measure text-body text-grau">
        Sie können Ihren Neuwagen online zulassen, wenn Sie die folgenden Unterlagen und Angaben haben. Danach bestätigen Sie in einem
        zweiten Schritt Ihre Identität.
      </p>

      {REQUIREMENTS.map((requirement) => (
        <div key={requirement.key} className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-small font-normal text-grau-dark">{requirement.question}</legend>
            <RadioGroup value={answers[requirement.key] ?? null} onValueChange={(value) => setAnswers((current) => ({ ...current, [requirement.key]: value as boolean }))}>
              <Choice value={true} label="Ja" />
              <Choice value={false} label="Nein" />
            </RadioGroup>
          </fieldset>
          {answers[requirement.key] === false ? (
            <Alert role="status" variant="warning" className="measure">
              {requirement.stop}
            </Alert>
          ) : null}
        </div>
      ))}

      <TextField
        id={POSTCODE_ID}
        label="Postleitzahl Ihres Wohnorts"
        helper="Danach richtet sich Ihre Zulassungsstelle: Ein Auto wird dort zugelassen, wo sein Halter wohnt."
        error={error}
        value={postcode}
        onChange={(event) => {
          setPostcode(event.target.value)
          setError(undefined)
        }}
        autoComplete="postal-code"
        inputMode="numeric"
        maxLength={5}
        className="max-w-md"
        inputClassName="max-w-40"
      />

      <div>
        <Button type="submit" disabled={!ready || checking}>
          {checking ? "Wird geprüft …" : "Weiter"}
        </Button>
      </div>
    </form>
  )
}
