import Link from "next/link"
import { buttonLink } from "@/components/ui/button"
import { Wordmark } from "@/src/ui/wordmark"
import { MobileNav, type NavItem } from "./mobile-nav"

// site-contract.md §3 — the landing header is sticky and carries at most three
// nav items plus the single primary action. The header is shared with the legal
// pages, so every target is absolute.
const NAV: readonly NavItem[] = [
  { label: "Leistungen", href: "/#leistungen" },
  { label: "Ablauf", href: "/#ablauf" },
  { label: "Fragen", href: "/#fragen" },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/95 shadow-md backdrop-blur-[2px]">
      <div className="page-frame flex h-16 items-center justify-between gap-4 sm:h-18 sm:gap-6">
        <Link
          href="/"
          className="flex items-center rounded-sm"
          aria-label="ZulexGO — zur Startseite"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Hauptnavigation" className="hidden md:block">
          <ul className="flex items-center gap-6 lg:gap-8">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-body text-grau underline-offset-4 transition-colors hover:text-orange-dark hover:underline"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Below 640px the header would overflow at 320px, so the action
              lives in the nav panel instead. */}
          <Link
            href="/#leistungen"
            className={buttonLink({
              size: "sm",
              className: "hidden sm:inline-flex",
            })}
          >
            Abmeldung starten
          </Link>
          <MobileNav items={NAV} />
        </div>
      </div>
    </header>
  )
}
