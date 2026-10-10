import { ArrowRight } from "lucide-react"
import { buttonLink } from "@/src/ui/button"
import { KbaSeal } from "./kba-seal"

const STATS = [
  { value: "24/7", label: "Online beauftragen, wann Sie wollen" },
  { value: "0", label: "Termine bei der Behörde" },
  { value: "100 %", label: "Online, ohne Kundenkonto" },
]

export function Hero() {
  return (
    <section className="py-(--section-gap)">
      <div className="page-frame">
        <div className="lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-16">
          <div>
            <p className="text-small font-normal tracking-[0.1em] text-grau-bright uppercase">
              Amtlicher Vorgang über das Kraftfahrt-Bundesamt
            </p>

            <h1 className="mt-5 max-w-[18ch] text-grau-dark sm:mt-6">
              Fahrzeug online an- und abmelden
            </h1>

            <p className="measure mt-(--heading-space-below) text-subtitle text-grau">
              Abmeldung, Neuzulassung, Ummeldung und mehr: offiziell über das
              KBA, ohne Termin bei der Zulassungsstelle.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-start">
              <a href="#leistungen" className={buttonLink()}>
                Leistung wählen
                <ArrowRight aria-hidden="true" />
              </a>
              <a href="#ablauf" className={buttonLink({ variant: "outline" })}>
                So funktioniert es
              </a>
            </div>
          </div>

          <KbaSeal
            sizes="(min-width: 1024px) 256px, 144px"
            className="mt-10 size-36 lg:mt-0 lg:size-64"
          />
        </div>

        <dl className="mt-12 grid gap-6 border-t border-border pt-8 sm:mt-16 sm:grid-cols-3 sm:gap-8 sm:pt-10">
          {STATS.map((stat) => (
            <div key={stat.label} className="flex flex-col-reverse">
              <dt className="mt-2 text-small text-grau-bright">{stat.label}</dt>
              <dd className="text-h3 font-light text-grau-dark">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
