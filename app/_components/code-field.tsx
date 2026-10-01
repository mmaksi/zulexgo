"use client"

import { TextField } from "@/app/_components/text-field"

/** design-standard §7: one centred box per code, paired with where to find it (photo placeholder until M7). */
export function CodeField({
  length,
  where,
  ...field
}: Parameters<typeof TextField>[0] & { length: number; where: string }) {
  return (
    <TextField {...field} helper={where} maxLength={length} className="max-w-60" inputClassName="code-input" data-1p-ignore>
      <div aria-hidden="true" className="flex h-16 max-w-60 items-center justify-center rounded-sm bg-bg-blue text-small text-grau-bright">
        Foto: wo der Code steht
      </div>
    </TextField>
  )
}
