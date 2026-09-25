"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/ui/accordion"
import { Section, SectionHeading } from "@/src/ui/section"

// content-model.md §1 — 5-8 items, question <=80, answer <=400 chars, plain German.
const FAQ = [
  {
    question: "Ist die Online-Abmeldung offiziell gültig?",
    answer:
      "Ja. Die Abmeldung läuft über die amtliche i-Kfz-Schnittstelle des Kraftfahrt-Bundesamtes. Sie erhalten dieselbe Bestätigung wie am Schalter der Zulassungsstelle.",
  },
  {
    question: "Welche Unterlagen brauche ich?",
    answer:
      "Die Zulassungsbescheinigung Teil I mit unbeschädigtem Sicherheitscode und die Stempelplaketten auf dem Kennzeichen. Bei zwei Kennzeichen benötigen wir beide Plakettencodes.",
  },
  {
    question: "Wo finde ich die Sicherheitscodes?",
    answer:
      "Der siebenstellige Code steht verdeckt auf der Zulassungsbescheinigung Teil I, die dreistelligen Codes liegen unter der Folie der Stempelplaketten. Zu jedem Feld zeigen wir ein Foto der genauen Stelle.",
  },
  {
    question: "Wie lange dauert die Abmeldung?",
    answer:
      "Ist die Zulassungsstelle online erreichbar, liegt die Bestätigung meist innerhalb eines Werktages vor. Bei manueller Bearbeitung dauert es länger — den aktuellen Stand sehen Sie jederzeit in Ihrem Status-Link.",
  },
  {
    question: "Was passiert, wenn der Antrag abgelehnt wird?",
    answer:
      "Sie erfahren den Grund in verständlicher Sprache. Lässt sich der Fehler korrigieren, reichen Sie die Daten ohne Zusatzkosten erneut ein. Ist die Abmeldung nicht möglich, erstatten wir den Betrag gemäß unserer Rückerstattungsregel.",
  },
  {
    question: "Brauche ich ein Kundenkonto?",
    answer:
      "Nein. Nach der Zahlung erhalten Sie einen persönlichen Status-Link per E-Mail. Über diesen Link sehen Sie den Fortschritt und laden Ihre Dokumente herunter.",
  },
  {
    question: "Sind meine Daten sicher?",
    answer:
      "Ihre Daten werden verschlüsselt übertragen und ausschließlich für die Abmeldung verwendet. Sicherheitscodes erscheinen nie auf der Statusseite und werden nicht in E-Mails versendet.",
  },
]

export function Faq() {
  return (
    <Section id="fragen">
      <SectionHeading
        eyebrow="Häufige Fragen"
        title="Alles, was Sie wissen sollten"
      />

      {/* keepMounted keeps the answers in the HTML, so they are indexable
          and readable without JavaScript. */}
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
