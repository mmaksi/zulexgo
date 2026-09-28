import Link from "next/link"
import type { ReactNode } from "react"
import { Wordmark } from "@/src/ui/wordmark"
import { SiteFooter } from "./site-footer"

/** site-contract §3: one task per page (funnel, status), so no landing nav; the logo is the only other exit. */
export function TaskLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-white">
        <div className="page-frame flex h-16 items-center sm:h-18">
          <Link href="/" className="flex items-center rounded-sm" aria-label="ZulexGO — zur Startseite">
            <Wordmark />
          </Link>
        </div>
      </header>
      <main className="page-frame flex-1 py-(--section-gap)">{children}</main>
      <SiteFooter />
    </>
  )
}
