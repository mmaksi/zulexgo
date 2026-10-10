import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/src/lib/utils"

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className="relative w-full has-[select:disabled]:opacity-60">
      <select
        data-slot="native-select"
        className={cn(
          "h-12 w-full min-w-0 appearance-none rounded-sm border border-input bg-white py-3 pr-10 pl-4 text-body font-normal text-grau-dark transition-[border-color,background-color] outline-none hover:border-grau focus-visible:border-2 focus-visible:border-grau-dark focus-visible:bg-bg-blue focus-visible:pl-[15px] disabled:cursor-not-allowed disabled:bg-bg-blue aria-invalid:border-2 aria-invalid:border-error aria-invalid:pl-[15px]",
          className
        )}
        {...props}
      />
      <ChevronDownIcon aria-hidden="true" data-slot="native-select-icon" className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-grau" />
    </div>
  )
}

function NativeSelectOption(props: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" {...props} />
}

export { NativeSelect, NativeSelectOption }
