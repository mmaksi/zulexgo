import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/src/lib/utils"

// design-standard.md §2.4 semantic tints with a 4px left rule; text stays grau-dark
// on every tint. No default role: callers choose `alert`, `status` or none, since
// a static notice must not interrupt a screen reader.
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
