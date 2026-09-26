import Link from "next/link"
import { Wedge } from "@/src/ui/wedge"
import { Wordmark } from "@/src/ui/wordmark"
import { CurrentYear } from "./current-year"

// site-contract.md §2.1 — the footer carries the statutory links and support contact.
const LEGAL = [
  { label: "Impressum", href: "/impressum" },
  { label: "AGB", href: "/agb" },
  { label: "Datenschutz", href: "/datenschutz" },
] as const

const SUPPORT_EMAIL = "kontakt@gm-gastro.com"

export function SiteFooter() {
  return (
    <footer className="mt-auto">
      {/* §5.1 the page terminator closes the page above the footer */}
      <Wedge variant="page" />

      <div className="bg-grau-dark text-white">
        <div className="page-frame flex flex-col gap-10 py-12 md:flex-row md:items-start md:justify-between">
          <div>
            <Wordmark tone="dark" />
            <p className="mt-4 max-w-sm text-small text-white/70">
              Ein Service der G&amp;M Gastro Event GmbH · Kaiserstraße 75 ·
              53721 Siegburg
            </p>
            <p className="mt-2 text-small text-white/70">
              Fragen? {" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-white underline decoration-1 underline-offset-4 transition-colors hover:text-orange-bright hover:decoration-2"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>

          <nav aria-label="Rechtliches">
            <ul className="flex flex-wrap gap-x-8">
              {LEGAL.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-12 items-center text-small text-white/70 underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="page-frame border-t border-white/10 py-6">
          <p className="text-small text-white/60">
            © <CurrentYear /> ZulexGO. Außerbetriebsetzung über die
            amtliche i-Kfz-Schnittstelle des Kraftfahrt-Bundesamtes.
          </p>
        </div>
      </div>
    </footer>
  )
}
