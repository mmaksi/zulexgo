"use client"

import { formatEuros } from "@/src/core/domain/payment/money"
import { PROCESSING_FEE } from "@/src/core/domain/payment/pricing"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/ui/accordion"
import { Section, SectionHeading } from "@/src/ui/section"

const FAQ = [
  {
    question: "Sind die Online-Leistungen offiziell gültig?",
    answer:
      "Ja. Jeder Antrag läuft über die amtliche i-Kfz-Schnittstelle des Kraftfahrt-Bundesamtes. Bei der Abmeldung erhalten Sie dieselbe Bestätigung wie am Schalter der Zulassungsstelle.",
  },
  {
    question: "Welche Leistungen bietet ZulexGO an?",
    answer:
      "Abmeldung, Neuzulassung, Wiederzulassung, Ummeldung und Adressänderung. Welche Sie schon jetzt online beauftragen können, zeigt die Übersicht oben; die übrigen folgen.",
  },
  {
    question: "Was kostet eine Leistung, und was ist enthalten?",
    answer: `Jede Leistung hat einen Festpreis, den Sie vor dem Start in der Übersicht sehen: Behördengebühr, Mehrwertsteuer und unsere Bearbeitung sind enthalten. Brechen Sie nach einem Fehler ab oder lässt sich der Antrag nicht korrigieren, behalten wir ${formatEuros(PROCESSING_FEE)} Bearbeitungsgebühr ein und erstatten den Rest innerhalb von 3–5 Werktagen.`,
  },
  {
    question: "Was brauche ich für die Abmeldung?",
    answer:
      "Die Zulassungsbescheinigung Teil I mit unbeschädigtem Sicherheitscode und die Stempelplaketten auf dem Kennzeichen. Den siebenstelligen Code finden Sie verdeckt auf Teil I, die dreistelligen unter der Folie der Plaketten. Bei zwei Kennzeichen brauchen wir beide Plakettencodes.",
  },
  {
    question: "Wie lange dauert ein Antrag?",
    answer:
      "Die Abmeldung füllen Sie in rund 10 Minuten aus und bezahlen sie. Ist die Zulassungsstelle online erreichbar, liegt die Bestätigung meist innerhalb eines Werktages vor, sonst dauert es länger. Den Stand sehen Sie jederzeit in Ihrem Status-Link.",
  },
  {
    question: "Was passiert, wenn der Antrag abgelehnt wird?",
    answer:
      "Lässt sich der Fehler korrigieren, klären wir die Korrektur mit Ihnen, ohne Zusatzkosten. Ist die Leistung nicht möglich, erstatten wir den Betrag gemäß unserer Rückerstattungsregel.",
  },
  {
    question: "Brauche ich ein Kundenkonto?",
    answer:
      "Nein. Nach der Zahlung erhalten Sie einen persönlichen Status-Link per E-Mail. Über diesen Link sehen Sie jederzeit, wie weit Ihr Antrag ist.",
  },
  {
    question: "Sind meine Daten sicher?",
    answer:
      "Ihre Daten werden verschlüsselt übertragen und ausschließlich für Ihren Antrag verwendet. Sicherheitscodes erscheinen nie auf der Statusseite und werden nicht in E-Mails versendet.",
  },
]

export function Faq() {
  return (
    <Section id="fragen">
      <SectionHeading
        eyebrow="Häufige Fragen"
        title="Alles, was Sie wissen sollten"
      />

      <Accordion keepMounted className="max-w-3xl">
        {FAQ.map((item) => (
          <AccordionItem key={item.question} className="border-border">
            <AccordionTrigger className="gap-8 py-5 text-subtitle font-light text-grau-dark hover:no-underline **:data-[slot=accordion-trigger-icon]:size-5 **:data-[slot=accordion-trigger-icon]:text-grau">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="measure pb-6 text-body text-grau">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  )
}
