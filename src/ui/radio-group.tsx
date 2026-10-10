"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { cn } from "@/src/lib/utils"

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return <RadioGroupPrimitive data-slot="radio-group" className={cn("grid w-full gap-3", className)} {...props} />
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "peer relative flex size-5 shrink-0 items-center justify-center rounded-full border border-input bg-white transition-colors outline-none after:absolute after:-inset-3.5 hover:border-grau-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:border-orange",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator data-slot="radio-group-indicator" className="size-2.5 rounded-full bg-orange" />
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
