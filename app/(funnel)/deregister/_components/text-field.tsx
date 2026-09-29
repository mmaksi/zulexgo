"use client"

import type { ComponentProps, ReactNode } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/src/ui/field"
import { Input } from "@/src/ui/input"
import { Alert } from "@/src/ui/alert"

/** A labelled input with its helper text and error, both announced with the field. */
export function TextField({
  id,
  label,
  helper,
  error,
  warning,
  className,
  inputClassName,
  children,
  ...input
}: Omit<ComponentProps<"input">, "id"> & {
  inputClassName?: string
  id: string
  label: string
  helper?: string
  error?: string
  warning?: string
  children?: ReactNode
}) {
  const described = [helper && `${id}-helper`, error && `${id}-error`, warning && `${id}-warning`].filter(Boolean).join(" ")
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} className={inputClassName} aria-invalid={error ? true : undefined} aria-describedby={described || undefined} {...input} />
      {helper ? (
        <FieldDescription id={`${id}-helper`}>{helper}</FieldDescription>
      ) : null}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : null}
      {warning && !error ? (
        <Alert id={`${id}-warning`} variant="warning" className="px-3 py-2 text-small">
          {warning}
        </Alert>
      ) : null}
      {children}
    </Field>
  )
}
