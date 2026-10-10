"use client"

import { LocatorPhoto } from "@/app/_components/locator-photo"
import { TextField } from "@/app/_components/text-field"

export function CodeField({
  length,
  where,
  locates,
  ...field
}: Parameters<typeof TextField>[0] & { length: number; where: string; locates?: string }) {
  return (
    <TextField {...field} helper={where} maxLength={length} className="max-w-60" inputClassName="code-input" data-1p-ignore>
      <LocatorPhoto what={locates} />
    </TextField>
  )
}
