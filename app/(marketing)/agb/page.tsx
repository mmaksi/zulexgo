import type { Metadata } from "next"
import { LegalLink, LegalPage, LegalSection } from "@/app/_components/legal-page"

export const metadata: Metadata = {
  title: "AGB — ZulexGO",
  description: "Allgemeine Geschäftsbedingungen von ZulexGO.",
}

export default function AgbPage() {
  return (
    <LegalPage title="AGB">
      <LegalSection heading="In Vorbereitung">
        <p>
          Unsere Allgemeinen Geschäftsbedingungen werden derzeit rechtlich
          geprüft und an dieser Stelle veröffentlicht, bevor der Dienst
          kostenpflichtig nutzbar ist.
        </p>
        <p>
          Bei Fragen wenden Sie sich bitte an{" "}
          <LegalLink href="mailto:kontakt@gm-gastro.com">
            kontakt@gm-gastro.com
          </LegalLink>
          .
        </p>
      </LegalSection>
    </LegalPage>
  )
}
