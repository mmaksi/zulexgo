"use client"

import type { ComponentProps, ReactNode } from "react"
import { Input } from "@/src/ui/input"
import { Label } from "@/src/ui/label"
import { cn } from "@/src/lib/utils"

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
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className={inputClassName} aria-invalid={error ? true : undefined} aria-describedby={described || undefined} {...input} />
      {helper ? (
        <p id={`${id}-helper`} className="text-small text-grau-bright">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-small text-error">
          {error}
        </p>
      ) : null}
      {warning && !error ? (
        <p id={`${id}-warning`} className="border-l-4 border-warning bg-warning-tint px-3 py-2 text-small text-grau-dark">
          {warning}
        </p>
      ) : null}
      {children}
    </div>
  )
}
