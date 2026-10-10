import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/src/lib/utils"

// No default role: a static notice must not interrupt a screen reader, so callers choose one.
const alertVariants = cva("border-l-4 p-4 text-body text-grau-dark", {
  variants: {
    variant: {
      info: "border-grau bg-info-tint",
      warning: "border-warning bg-warning-tint",
      error: "border-error bg-error-tint",
    },
  },
  defaultVariants: {
    variant: "info",
  },
})

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />
}

export { Alert }
