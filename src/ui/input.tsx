import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/src/lib/utils"

// design-standard.md §4.4/§6.3 — 12px 16px padding, 48px min height,
// --border-default at rest, grau on hover, 2px grau-dark plus bg-blue on focus,
// no glow. 16px text so iOS does not zoom into the field.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-sm border border-input bg-white px-4 py-3 text-body font-normal text-grau-dark transition-[border-color,background-color] outline-none placeholder:text-grau-bright hover:border-grau focus-visible:border-2 focus-visible:border-grau-dark focus-visible:bg-bg-blue focus-visible:px-[15px] focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-bg-blue disabled:opacity-60 aria-invalid:border-2 aria-invalid:border-error aria-invalid:px-[15px]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
