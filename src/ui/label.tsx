import * as React from "react"
import { cn } from "@/src/lib/utils"

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
