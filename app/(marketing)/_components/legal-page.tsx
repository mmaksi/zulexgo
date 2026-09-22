import type { ReactNode } from "react"

/**
 * site-contract.md §1 — legal pages are single-column static text. Body copy
 * stays inside the measure; headings keep the 2:1 above/below rhythm.
 */
export function LegalPage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="page-frame py-(--section-gap)">
      <article className="measure">
        <h1 className="text-grau-dark">{title}</h1>
        <div className="mt-(--section-gap) flex flex-col gap-(--heading-space-above)">
          {children}
        </div>
      </article>
    </div>
  )
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: ReactNode
}) {
  return (
    <section>
      <h2 className="text-h4 text-grau-dark">{heading}</h2>
      <div className="mt-(--heading-space-below) flex flex-col gap-4 text-body text-grau">
        {children}
      </div>
    </section>
  )
}

/** §6.3 inline link: underline thickens on hover, colour goes to orange-dark. */
export function LegalLink({
  href,
  external,
  children,
}: {
  href: string
  external?: boolean
  children: ReactNode
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="text-grau-dark underline decoration-1 underline-offset-4 transition-colors hover:text-orange-dark hover:decoration-2"
    >
      {children}
    </a>
  )
}
