"use client"

import { useState } from "react"
import { flushSync } from "react-dom"
import { fieldsOf, validateFields, type RegistrationData, type RegistrationField, type Step, type TextualField } from "./registration-data"

export const fieldId = (field: RegistrationField) => `registration-${field}`

export interface StepProps {
  data: RegistrationData
  onChange: (changes: Partial<RegistrationData>) => void
  onNext: () => void
}

export function useStepForm(step: Step, data: RegistrationData, onChange: StepProps["onChange"]) {
  const [errors, setErrors] = useState<Partial<Record<TextualField, string>>>({})

  const set = <Field extends RegistrationField>(field: Field, value: RegistrationData[Field]) => {
    onChange({ [field]: value })
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const bind = (field: TextualField, { upper = false } = {}) => ({
    id: fieldId(field),
    value: data[field],
    error: errors[field],
    onChange: (event: { target: { value: string } }) => set(field, upper ? event.target.value.toUpperCase() : event.target.value),
  })

  const check = (): boolean => {
    const fields = fieldsOf(step, data)
    const found = validateFields(data, fields, new Date())
    flushSync(() => setErrors(found))
    const firstWrong = fields.find((field) => found[field])
    if (firstWrong) document.getElementById(fieldId(firstWrong))?.focus()
    return firstWrong === undefined
  }

  return { errors, set, setErrors, bind, check }
}
