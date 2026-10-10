import type { ReactNode } from "react"
import { cn } from "@/src/lib/utils"

function PlateFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-stretch overflow-hidden rounded-sm border-2 border-grau-dark bg-white", className)}>
      <span aria-hidden="true" className="flex w-7 shrink-0 items-end justify-center bg-eu-blue pb-1 text-small text-white">
        D
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

export { PlateFrame }
