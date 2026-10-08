"use client"

import type { ComponentProps } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/src/ui/field"
import { NativeSelect } from "@/src/ui/native-select"

/** A labelled native select with its helper text and error, both announced with it, as `TextField` does for an input. */
export function SelectField({
  id,
  label,
  helper,
  error,
  className,
  children,
  ...select
}: Omit<ComponentProps<"select">, "id"> & { id: string; label: string; helper?: string; error?: string }) {
  const described = [helper && `${id}-helper`, error && `${id}-error`].filter(Boolean).join(" ")
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect id={id} aria-invalid={error ? true : undefined} aria-describedby={described || undefined} {...select}>
        {children}
      </NativeSelect>
      {helper ? <FieldDescription id={`${id}-helper`}>{helper}</FieldDescription> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  )
}
