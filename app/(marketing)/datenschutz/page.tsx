import type { Metadata } from "next"
import { LegalLink, LegalPage, LegalSection } from "@/app/_components/legal-page"

export const metadata: Metadata = {
  title: "Datenschutzerklärung — ZulexGO",
  description:
    "Wie ZulexGO personenbezogene Daten verarbeitet und welche Rechte Sie haben.",
}

const RIGHTS = [
  "Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)",
  "Berichtigung unrichtiger Daten (Art. 16 DSGVO)",
  "Löschung Ihrer Daten (Art. 17 DSGVO)",
  "Einschränkung der Verarbeitung (Art. 18 DSGVO)",
  "Datenübertragbarkeit (Art. 20 DSGVO)",
  "Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)",
  "Beschwerde bei der zuständigen Aufsichtsbehörde",
]

export default function DatenschutzPage() {
  return (
    <LegalPage title="Datenschutz">
      <LegalSection heading="Verantwortlicher">
        <p>
          G&amp;M Gastro Event GmbH
          <br />
          Kaiserstraße 75 · 53721 Siegburg
        </p>
        <p>
          E-Mail:{" "}
          <LegalLink href="mailto:kontakt@gm-gastro.com">
            kontakt@gm-gastro.com
          </LegalLink>
          <br />
          Telefon:{" "}
          <LegalLink href="tel:+4922413226590">
            +49 (0) 2241 322 65 90
          </LegalLink>
        </p>
      </LegalSection>

      <LegalSection heading="Verantwortlich für Datenschutzfragen">
        <p>
          G&amp;M Gastro Event GmbH, z. Hd. Gedion Yelemowork Krischan
          Hoscheidt
          <br />
          Kaiserstraße 75 · 53721 Siegburg
          <br />
          E-Mail:{" "}
          <LegalLink href="mailto:kontakt@gm-gastro.com">
            kontakt@gm-gastro.com
          </LegalLink>
        </p>
      </LegalSection>

      <LegalSection heading="Hosting">
        <p>
          Wir hosten unsere Website bei Vercel. Zum Zweck der Bereitstellung
          und Auslieferung der Website werden Verbindungsdaten verarbeitet.
          Über den Aufruf hinaus werden diese Daten nicht gespeichert.
        </p>
        <p>
          Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse).
        </p>
      </LegalSection>

      <LegalSection heading="Erhobene Daten und Zweck">
        <p>
          Wir erheben Name, Adresse, E-Mail-Adresse, Telefonnummer sowie
          fahrzeugbezogene Daten (Kennzeichen, FIN, Sicherheitscodes)
          ausschließlich zur Abwicklung der Außerbetriebsetzung und zur
          Weiterleitung an die zuständige Behörde über die Zulex-API.
          Sicherheitscodes werden nicht dauerhaft gespeichert, nicht
          protokolliert und nicht per E-Mail versendet.
        </p>
        <p>
          Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
        </p>
      </LegalSection>

      <LegalSection heading="Zahlungsabwicklung">
        <p>
          Zahlungen werden über Stripe abgewickelt (PCI-DSS-zertifiziert).
          ZulexGO speichert keine Zahlungsdaten auf eigenen Servern.
        </p>
        <p>
          Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
        </p>
        <p>
          Weitere Informationen:{" "}
          <LegalLink href="https://stripe.com/de/privacy" external>
            stripe.com/de/privacy
          </LegalLink>
        </p>
      </LegalSection>

      <LegalSection heading="Status-Link und E-Mails">
        <p>
          Nach der Beauftragung erhalten Sie einen einmaligen, nicht
          erratbaren Status-Link per E-Mail sowie eine Nachricht zu jeder
          Statusänderung. Ihre E-Mail-Adresse wird ausschließlich zu diesem
          Zweck verwendet.
        </p>
        <p>
          Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung).
        </p>
      </LegalSection>

      <LegalSection heading="Web-Schriften">
        <p>
          Wir verwenden Google Fonts von Google Ireland Limited, Gordon House,
          Barrow Street, Dublin 4, Irland, zur Bereitstellung von Schriftarten.
        </p>
        <p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          Diese Website verwendet ausschließlich technisch notwendige Cookies.
          Tracking- oder Marketing-Cookies werden nicht ohne Ihre ausdrückliche
          Einwilligung gesetzt.
        </p>
        <p>Rechtsgrundlage: § 25 Abs. 2 Nr. 2 TDDDG.</p>
      </LegalSection>

      <LegalSection heading="Ihre Rechte">
        <p>Sie haben das Recht auf:</p>
        <ul className="flex flex-col gap-2">
          {RIGHTS.map((right) => (
            <li key={right} className="flex gap-3">
              <span aria-hidden="true" className="text-grau-bright">
                ·
              </span>
              <span>{right}</span>
            </li>
          ))}
        </ul>
        <p>
          Kontakt:{" "}
          <LegalLink href="mailto:kontakt@gm-gastro.com">
            kontakt@gm-gastro.com
          </LegalLink>
        </p>
      </LegalSection>

      <LegalSection heading="Widerruf und Widerspruch">
        <p>
          Eine erteilte Einwilligung können Sie jederzeit widerrufen. Die
          Rechtmäßigkeit der bis zum Widerruf verarbeiteten Daten bleibt
          hiervon unberührt.
        </p>
        <p>
          Kontakt:{" "}
          <LegalLink href="mailto:kontakt@gm-gastro.com">
            kontakt@gm-gastro.com
          </LegalLink>
        </p>
      </LegalSection>
    </LegalPage>
  )
}
