import { ArrowRight } from "lucide-react"
import { Badge } from "@/src/ui/badge"
import { buttonLink } from "@/src/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/ui/card"
import { Section, SectionHeading } from "@/src/ui/section"

/**
 * prd.md §3 — the MVP sells de-registration only; every other service is
 * visible but disabled, so the roadmap is legible without being clickable.
 * content-model.md §1 — title <=30, description <=90, CTA label <=20 chars.
 */
const SERVICES = [
  {
    title: "Abmeldung",
    description:
      "Fahrzeug offiziell außer Betrieb setzen — bei Verkauf, Verschrottung oder Export.",
    price: "ab 29,00 €",
    available: true,
  },
  {
    title: "Neuzulassung",
    description:
      "Neues Fahrzeug erstmals anmelden — inklusive Kennzeichen und Bescheinigung.",
    price: "ab 99,00 €",
    available: false,
  },
  {
    title: "Ummeldung",
    description:
      "Fahrzeug auf einen neuen Halter oder eine neue Adresse umschreiben.",
    price: "ab 89,00 €",
    available: false,
  },
  {
    title: "Wiederzulassung",
    description:
      "Abgemeldetes Fahrzeug wieder zulassen — ohne Gang zur Zulassungsstelle.",
    price: "ab 89,00 €",
    available: false,
  },
]

export function ServiceSelection() {
  return (
    <Section id="leistungen" className="bg-white">
      <SectionHeading
        eyebrow="Leistungen"
        title="Was möchten Sie erledigen?"
        lede="Der angezeigte Preis ist ein Endpreis: Behördengebühr und Mehrwertsteuer sind enthalten."
      />

      <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
        {SERVICES.map((service) => (
          <li key={service.title} className="flex">
            <Card
              aria-disabled={!service.available || undefined}
              className={
                service.available
                  ? "flex-1 transition-colors hover:border-grau-bright"
                  : "flex-1 bg-bg-blue"
              }
            >
              <CardHeader>
                <CardTitle>{service.title}</CardTitle>
              </CardHeader>

              <CardContent className="flex-1">
                <CardDescription>{service.description}</CardDescription>
              </CardContent>

              {/* The price and the action slot are the same height in every
                  card, so the row reads as one line across the grid. */}
              <CardFooter className="flex-col items-start gap-4">
                <p className="text-h4 font-light text-grau-dark">
                  {service.price}
                </p>
                <div className="flex min-h-12 w-full items-center">
                  {service.available ? (
                    <a
                      href="#ablauf"
                      className={buttonLink({ className: "w-full" })}
                    >
                      Abmeldung starten
                      <ArrowRight aria-hidden="true" />
                    </a>
                  ) : (
                    <Badge variant="secondary">Bald verfügbar</Badge>
                  )}
                </div>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  )
}
