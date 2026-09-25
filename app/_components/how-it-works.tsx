import { Section, SectionHeading } from "@/src/ui/section"

// content-model.md §1 — exactly four steps, title <=30, text <=120 chars.
const STEPS = [
  {
    title: "Voraussetzungen prüfen",
    text: "Wir prüfen in wenigen Klicks, ob Ihr Fahrzeug online abgemeldet werden kann.",
  },
  {
    title: "Daten und Codes eingeben",
    text: "Kennzeichen, FIN und die Sicherheitscodes von Bescheinigung und Plakettensiegel.",
  },
  {
    title: "Sicher bezahlen",
    text: "Gesamtpreis inklusive Behördengebühr. Belastet wird erst nach der Übermittlung.",
  },
  {
    title: "Bestätigung erhalten",
    text: "Jeden Schritt im Status-Link verfolgen und die amtliche Bestätigung als PDF laden.",
  },
]

export function HowItWorks() {
  return (
    <Section id="ablauf" className="bg-bg-blue">
      <SectionHeading
        eyebrow="Ablauf"
        title="In vier Schritten erledigt"
        lede="Kein Papierkram und keine Wartezeit — der gesamte Vorgang läuft online."
      />

      <ol className="grid gap-8 sm:grid-cols-2 sm:gap-10 xl:grid-cols-4">
        {STEPS.map((step, index) => (
          <li key={step.title} className="border-t border-grau-bright pt-6">
            <span
              aria-hidden="true"
              className="block text-h4 font-light text-grau-bright"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-4 text-h4 text-grau-dark">{step.title}</h3>
            <p className="mt-(--heading-space-below) text-body text-grau">
              {step.text}
            </p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
