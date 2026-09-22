import { ArrowRight } from "lucide-react"
import { buttonLink } from "@/src/ui/button"

// content-model.md §1 — headline <=60, subline <=140, CTA <=25 chars, verb-first.
const STATS = [
  { value: "10 Min.", label: "Ausfüllen und bezahlen" },
  { value: "0", label: "Termine bei der Behörde" },
  { value: "100 %", label: "Online, ohne Kundenkonto" },
]

export function Hero() {
  return (
    <section className="py-(--section-gap)">
      <div className="page-frame">
        <p className="text-small font-normal tracking-[0.1em] text-grau-bright uppercase">
          Amtlicher Vorgang über das Kraftfahrt-Bundesamt
        </p>

        <h1 className="mt-5 max-w-[18ch] text-grau-dark sm:mt-6">
          Fahrzeug online abmelden
        </h1>

        <p className="measure mt-(--heading-space-below) text-subtitle text-grau">
          Die Außerbetriebsetzung erledigen Sie in unter 10 Minuten — offiziell
          über das KBA, ohne Termin bei der Zulassungsstelle.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-start">
          <a href="#leistungen" className={buttonLink()}>
            Abmeldung starten
            <ArrowRight aria-hidden="true" />
          </a>
          <a href="#ablauf" className={buttonLink({ variant: "outline" })}>
            So funktioniert es
          </a>
        </div>

        {/* §7 numeric values sit in grau-dark and are never orange */}
        <dl className="mt-12 grid gap-6 border-t border-border pt-8 sm:mt-16 sm:grid-cols-3 sm:gap-8 sm:pt-10">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <dt className="sr-only">{stat.label}</dt>
              <dd>
                <span className="block text-h3 font-light text-grau-dark">
                  {stat.value}
                </span>
                <span className="mt-2 block text-small text-grau-bright">
                  {stat.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
