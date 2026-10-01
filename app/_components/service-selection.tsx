import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { formatEuros } from "@/src/core/domain/money"
import {
  CARBON_SURCHARGE,
  FINE_DUST_STICKER_PRICE,
  PLATE_PRICE,
  PLATE_SHIPPING,
  SERVICE_PRICES,
  type Service,
} from "@/src/core/domain/pricing"
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
 * site-contract.md §2.1 — title <=30, description <=90, CTA label <=20 chars.
 * Prices come from the price list, so a card can never quote what the
 * checkout does not charge.
 */
const SERVICES: { service: Service; title: string; description: string; available: boolean }[] = [
  {
    service: "deregistration",
    title: "Abmeldung",
    description:
      "Fahrzeug offiziell außer Betrieb setzen — bei Verkauf, Verschrottung oder Export.",
    available: true,
  },
  {
    service: "newRegistration",
    title: "Neuzulassung",
    description:
      "Neues Fahrzeug erstmals anmelden. Kennzeichen bestellen Sie auf Wunsch dazu.",
    available: false,
  },
  {
    service: "reRegistration",
    title: "Wiederzulassung",
    description:
      "Abgemeldetes Fahrzeug wieder zulassen — ohne Gang zur Zulassungsstelle.",
    available: false,
  },
  {
    service: "changeOfKeeper",
    title: "Ummeldung",
    description:
      "Fahrzeug auf einen neuen Halter ummelden — ohne Gang zur Zulassungsstelle.",
    available: false,
  },
  {
    service: "addressChange",
    title: "Adressänderung",
    description:
      "Neue Anschrift in den Fahrzeugpapieren eintragen — ohne Termin.",
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

      <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-5">
        {SERVICES.map((service) => (
          <li key={service.service} className="flex">
            <Card
              aria-disabled={!service.available || undefined}
              className={
                service.available
                  ? "relative flex-1 transition-[border-color,box-shadow] hover:border-grau-bright hover:shadow-elev-1"
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
                <p className="text-h3 font-light text-grau-dark">
                  {formatEuros(SERVICE_PRICES[service.service])}
                </p>
                <div className="flex min-h-12 w-full items-center">
                  {service.available ? (
                    // The link stretches over the card, so the whole card is
                    // the click target its hover state promises (§5.3).
                    <Link
                      href="/deregister"
                      className={buttonLink({ className: "w-full after:absolute after:inset-0" })}
                    >
                      Jetzt abmelden
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  ) : (
                    <Badge variant="secondary">Bald verfügbar</Badge>
                  )}
                </div>
              </CardFooter>
            </Card>
          </li>
        ))}
      </ul>

      <p className="measure mt-8 text-small text-grau">
        <span className="font-normal text-grau-dark">Zusatzleistungen zur Zulassung, bald verfügbar: </span>
        Kennzeichen {formatEuros(PLATE_PRICE)} pro Stück (Carbon +{formatEuros(CARBON_SURCHARGE)}),
        Feinstaubplakette {formatEuros(FINE_DUST_STICKER_PRICE)}, Versand {formatEuros(PLATE_SHIPPING)} nur bei
        Kennzeichen. Wir bestellen und berechnen sie erst, wenn Ihr Antrag erfolgreich abgeschlossen ist. Wird er
        abgelehnt, entstehen dafür keine Kosten.
      </p>
    </Section>
  )
}
