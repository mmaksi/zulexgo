import type { ReactNode } from "react"
import { cn } from "cn"

/**
 * design-standard.md §4.2/§4.3 — the 1200px page frame plus the section
 * rhythm. Both gaps are responsive tokens, so nothing here hard-codes a value.
 */
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

/** The 2:1 above/below ratio is what groups a heading with its content. */
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
