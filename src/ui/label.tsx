import * as React from "react"
import { cn } from "@/src/lib/utils"

// design-standard.md §3.2 — form labels are Kanit Regular (400) at the small
// size; Light below 16px is too fragile.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-small font-normal text-grau-dark select-none", className)}
      {...props}
    />
  )
}

export { Label }
