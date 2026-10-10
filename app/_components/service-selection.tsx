import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { isOrderable, type OrderableService, type Service } from "@/src/core/domain/application/service"
import { formatEuros } from "@/src/core/domain/payment/money"
import {
  CARBON_SURCHARGE,
  FINE_DUST_STICKER_PRICE,
  PLATE_PRICE,
  PLATE_SHIPPING,
  SERVICE_PRICES,
} from "@/src/core/domain/payment/pricing"
import { FUNNELS } from "@/app/_components/funnels"
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

const SERVICES: { service: Service; title: string; description: string }[] = [
  {
    service: "deregistration",
    title: "Abmeldung",
    description:
      "Fahrzeug offiziell außer Betrieb setzen — bei Verkauf, Verschrottung oder Export.",
  },
  {
    service: "newRegistration",
    title: "Neuzulassung",
    description:
      "Neues Fahrzeug erstmals zulassen — ohne Gang zur Zulassungsstelle.",
  },
  {
    service: "reRegistration",
    title: "Wiederzulassung",
    description:
      "Abgemeldetes Fahrzeug wieder zulassen — ohne Gang zur Zulassungsstelle.",
  },
  {
    service: "changeOfKeeper",
    title: "Ummeldung",
    description:
      "Fahrzeug auf einen neuen Halter ummelden — ohne Gang zur Zulassungsstelle.",
  },
  {
    service: "addressChange",
    title: "Adressänderung",
    description:
      "Neue Anschrift in den Fahrzeugpapieren eintragen — ohne Termin.",
  },
]

export function ServiceSelection({
  servicesOnSale,
  betaServices = [],
}: {
  servicesOnSale: readonly OrderableService[]
  betaServices?: readonly OrderableService[]
}) {
  const cards = SERVICES.map((card) => ({
    ...card,
    funnel: isOrderable(card.service) && servicesOnSale.includes(card.service) ? FUNNELS[card.service] : undefined,
    inBeta: isOrderable(card.service) && betaServices.includes(card.service),
  }))

  return (
    <Section id="leistungen" className="bg-white">
      <SectionHeading
        eyebrow="Leistungen"
        title="Was möchten Sie erledigen?"
        lede="Der angezeigte Preis ist ein Endpreis: Behördengebühr und Mehrwertsteuer sind enthalten."
      />

      <ul className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((service) => (
          <li key={service.service} className="flex">
            <Card
              aria-disabled={!service.funnel || undefined}
              className={
                service.funnel
                  ? "relative flex-1 transition-[border-color,box-shadow] hover:border-grau-bright hover:shadow-elev-1"
                  : "flex-1 bg-bg-blue"
              }
            >
              <CardHeader>
                <CardTitle>{service.title}</CardTitle>
              </CardHeader>

              <CardContent className="flex-1">
                <CardDescription>{service.description}</CardDescription>
                {service.funnel && service.inBeta ? (
                  <Badge variant="secondary" className="mt-4">
                    Nur mit Einladung
                  </Badge>
                ) : null}
              </CardContent>

              <CardFooter className="flex-col items-start gap-4">
                <p className="text-h3 font-light text-grau-dark">
                  {formatEuros(SERVICE_PRICES[service.service])}
                </p>
                <div className="flex min-h-12 w-full items-center">
                  {service.funnel ? (
                    <Link
                      href={service.funnel.href}
                      className={buttonLink({ className: "w-full after:absolute after:inset-0" })}
                    >
                      {service.funnel.label}
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
