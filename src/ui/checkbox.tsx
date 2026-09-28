"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { CheckIcon } from "lucide-react"
import { cn } from "@/src/lib/utils"

// design-standard.md §6.3 — border darkens on hover; checked fill is orange with
// a grau-dark mark; focus ring grau-dark. The ::after extends the tap target
// towards 48px (§4.4) without growing the box.
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border border-input bg-white transition-colors outline-none after:absolute after:-inset-3.5 hover:border-grau-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-error data-checked:border-orange data-checked:bg-orange data-checked:text-grau-dark",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center [&>svg]:size-4">
        <CheckIcon aria-hidden="true" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
