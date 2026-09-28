import Link from "next/link"
import { SiteFooter } from "@/app/_components/site-footer"
import { Wordmark } from "@/src/ui/wordmark"

/** site-contract §3: the funnel drops the landing nav; the logo is its only other exit. */
export default function FunnelLayout({ children }: LayoutProps<"/">) {
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
