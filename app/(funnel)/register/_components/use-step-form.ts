"use client"

import { useState } from "react"
import { flushSync } from "react-dom"
import { fieldsOf, validateFields, type RegistrationData, type RegistrationField, type Step, type TextualField } from "./registration-data"

export const fieldId = (field: RegistrationField) => `registration-${field}`

/** What the funnel hands each step: the form as far as entered, how to change it, and where to go once the step is valid. */
export interface StepProps {
  data: RegistrationData
  onChange: (changes: Partial<RegistrationData>) => void
  onNext: () => void
}

/**
 * What every step of the registration form does the same way: clears a field's error as the customer
 * edits it, and on "Weiter" checks the step's fields against the domain's own rules, focusing the first
 * that is wrong (site-contract §3). The data itself is the funnel's, updated as the customer types, so
 * going back keeps what was entered even in a step that was never submitted.
 */
export function useStepForm(step: Step, data: RegistrationData, onChange: StepProps["onChange"]) {
  const [errors, setErrors] = useState<Partial<Record<TextualField, string>>>({})

  const set = <Field extends RegistrationField>(field: Field, value: RegistrationData[Field]) => {
    onChange({ [field]: value })
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  /** What a `TextField` takes: its value and error, with the browser's own helpers off (it holds personal data). */
  const bind = (field: TextualField, { upper = false } = {}) => ({
    id: fieldId(field),
    value: data[field],
    error: errors[field],
    onChange: (event: { target: { value: string } }) => set(field, upper ? event.target.value.toUpperCase() : event.target.value),
  })

  /** Whether the step is valid; if not, says what is wrong and moves focus to the first wrong field. */
  const check = (): boolean => {
    const fields = fieldsOf(step, data)
    const found = validateFields(data, fields, new Date())
    // Rendered before focus moves, so the field announces its error as it is focused.
    flushSync(() => setErrors(found))
    const firstWrong = fields.find((field) => found[field])
    if (firstWrong) document.getElementById(fieldId(firstWrong))?.focus()
    return firstWrong === undefined
  }

  return { errors, set, setErrors, bind, check }
}
