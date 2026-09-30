import { PROCESSING_FEE } from "@/src/core/domain/pricing"
import { SUPPORT_EMAIL } from "@/src/core/domain/contact"
import { formatEuros } from "@/src/core/domain/money"
import type { EmailTemplate } from "@/src/core/ports/mailer"

/**
 * The German wording of business logic §5, one statement and one button per
 * email. Kept apart from the markup so it can be read and reviewed alone.
 * The reason in the correction and rejection emails is ours, from the
 * rejection catalogue (launch plan Q10); vendor text never reaches a customer.
 */
export interface EmailCopy {
  readonly subject: string
  readonly preview: string
  readonly heading: string
  readonly paragraphs: readonly string[]
  /** A callout under the paragraphs, for what must not be missed. */
  readonly note?: string
  readonly action?: { readonly label: string; readonly href: string }
}

const REFUND_TIMEFRAME = "Je nach Bank ist der Betrag in 3 bis 5 Werktagen auf Ihrem Konto."

export function copyFor(template: EmailTemplate): EmailCopy {
  const { reference } = template

  switch (template.name) {
    case "orderConfirmation":
      return {
        subject: `Ihr ZulexGO-Antrag ${reference} ist eingegangen`,
        preview: "Wir haben Ihren Antrag erhalten.",
        heading: "Ihr Antrag ist eingegangen",
        paragraphs: [
          `Vielen Dank für Ihren Antrag auf Außerbetriebsetzung. Ihre Auftragsnummer lautet ${reference}.`,
          "Den Betrag haben wir auf Ihrer Karte reserviert. Abgebucht wird er erst mit dem Ergebnis Ihres Antrags.",
          "Über Ihren persönlichen Link sehen Sie jederzeit, wie weit Ihr Antrag ist. Der Link ist nur für Sie bestimmt: Bitte geben Sie ihn nicht weiter.",
        ],
        action: { label: "Status ansehen", href: template.statusLink },
      }
    case "submittedToKba":
      return {
        subject: `Ihr Antrag ${reference} liegt beim KBA`,
        preview: "Wir warten auf die Antwort der Behörde.",
        heading: "Ihr Antrag liegt beim KBA",
        paragraphs: [
          "Wir haben Ihren Antrag an das Kraftfahrt-Bundesamt (KBA) übermittelt und warten auf dessen Antwort.",
          template.manualProcessing
            ? "Ihre Zulassungsstelle bearbeitet Abmeldungen von Hand. Das kann einige Tage dauern."
            : "Ihre Zulassungsstelle bearbeitet Abmeldungen online. Meist ist Ihr Antrag in wenigen Minuten bis Stunden erledigt.",
          "Sobald es Neuigkeiten gibt, schreiben wir Ihnen.",
        ],
        action: { label: "Status ansehen", href: template.statusLink },
      }
    case "completed":
      return {
        subject: `Geschafft! Ihr Antrag ${reference} ist abgeschlossen ✓`,
        preview: "Ihr Fahrzeug ist abgemeldet.",
        heading: "Ihr Fahrzeug ist abgemeldet",
        paragraphs: [
          "Das KBA hat Ihre Abmeldung bestätigt. Herzlichen Glückwunsch, alles ist erledigt.",
          "Die Bestätigung können Sie auf Ihrer Statusseite herunterladen. Bewahren Sie sie gut auf.",
        ],
        action: { label: "Bestätigung ansehen", href: template.statusLink },
      }
    case "correctionRequired":
      return {
        subject: `Ihr Antrag ${reference} braucht eine Korrektur`,
        preview: "Die Zulassungsstelle konnte den Antrag so nicht bearbeiten.",
        heading: "Ihr Antrag braucht eine Korrektur",
        paragraphs: [
          `${template.reason} Das lässt sich meist korrigieren.`,
          `Schreiben Sie uns an ${SUPPORT_EMAIL} und nennen Sie Ihre Auftragsnummer ${reference}. Wir korrigieren den Antrag gemeinsam mit Ihnen. Sie zahlen nur die Differenz, falls Mehrkosten entstehen.`,
        ],
        note: `Sie können den Antrag auch stornieren. Wir behalten dann die Bearbeitungsgebühr von ${formatEuros(PROCESSING_FEE)} ein und erstatten den Rest.`,
        action: { label: "Status ansehen", href: template.statusLink },
      }
    case "rejected":
      return {
        subject: `Ihr Antrag ${reference} wurde abgelehnt`,
        preview: "Wir erstatten Ihnen den Betrag.",
        heading: "Ihr Antrag wurde abgelehnt",
        paragraphs: [
          `${template.reason} Der Antrag zu Auftrag ${reference} konnte nicht abgeschlossen werden. Eine Korrektur ist nicht möglich; für die Abmeldung wäre ein neuer Antrag nötig.`,
          template.retained.cents > 0
            ? `Sie erhalten ${formatEuros(template.refund)} zurück. Die Bearbeitungsgebühr von ${formatEuros(template.retained)} behalten wir ein. Eine weitere E-Mail bestätigt die Erstattung.`
            : `Sie erhalten ${formatEuros(template.refund)} zurück. Eine weitere E-Mail bestätigt die Erstattung.`,
        ],
        action: { label: "Status ansehen", href: template.statusLink },
      }
    case "statusLinkResent":
      return {
        subject: `Ihr neuer Statuslink zu ${reference}`,
        preview: "Der bisherige Link ist nicht mehr gültig.",
        heading: "Ihr neuer Statuslink",
        paragraphs: [
          `Sie haben einen neuen Link zu Ihrem Antrag ${reference} angefordert. Der bisherige Link funktioniert nicht mehr.`,
          "Der neue Link ist nur für Sie bestimmt: Bitte geben Sie ihn nicht weiter.",
          `Sie haben ihn nicht angefordert? Dann schreiben Sie uns an ${SUPPORT_EMAIL}.`,
        ],
        action: { label: "Status ansehen", href: template.statusLink },
      }
    case "refundIssued":
      return {
        subject: `Ihre Erstattung zu ${reference} ist unterwegs`,
        preview: `Wir haben ${formatEuros(template.amount)} erstattet.`,
        heading: "Ihre Erstattung ist unterwegs",
        paragraphs: [`Wir haben Ihnen ${formatEuros(template.amount)} zu Auftrag ${reference} erstattet.`, REFUND_TIMEFRAME],
      }
  }
}
