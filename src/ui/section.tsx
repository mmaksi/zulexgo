import type { ReactNode } from "react"
import { cn } from "@/src/lib/utils"

export function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={cn("py-(--section-gap)", className)}>
      <div className="page-frame">{children}</div>
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string
  title: string
  lede?: string
}) {
  return (
    <header className="mb-[calc(var(--heading-space-above)-var(--heading-space-below))]">
      <p className="text-small font-normal tracking-[0.1em] text-grau-bright uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-grau-dark">{title}</h2>
      {lede ? (
        <p className="measure mt-(--heading-space-below) text-subtitle text-grau">
          {lede}
        </p>
      ) : null}
    </header>
  )
}
