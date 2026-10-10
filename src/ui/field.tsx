import * as React from "react"
import { cn } from "@/src/lib/utils"

import { Label } from "@/src/ui/label"

// The error has no live role: focus moves to the first invalid field instead.
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="field" className={cn("flex flex-col gap-2", className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn("w-fit", className)} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-small text-grau-bright", className)} {...props} />
}

function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-error" className={cn("text-small text-error", className)} {...props} />
}

export { Field, FieldDescription, FieldError, FieldLabel }
