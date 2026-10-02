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
  /** Carries the order reference, so the email can be found by it; short enough for an inbox. */
  readonly subject: string
  /** The inbox preview line. */
  readonly preview: string
  readonly heading: string
  /** Body text after the layout's fixed greeting; each entry is one paragraph. */
  readonly paragraphs: readonly string[]
  /** A callout under the paragraphs, for what must not be missed. */
  readonly note?: string
  /** The one button. Its `href` is always the status link, so no email links anywhere else. */
  readonly action?: { readonly label: string; readonly href: string }
}

const REFUND_TIMEFRAME = "Je nach Bank ist der Betrag in 3 bis 5 Werktagen auf Ihrem Konto."

/**
 * The German subject and body for one template. The switch has no default, so a template
 * added to `EmailTemplate` does not compile until it has wording here. What depends on the data:
 * - `orderConfirmation` says the card is charged once the application is filed and, at the
 *   latest, shortly before the hold lapses (the margin is `HOLD_CAPTURE_MARGIN_MS`).
 * - `submittedToKba` promises minutes to hours, or days when `manualProcessing`.
 * - `correctionRequired` and `rejected` open with `reason`; `correctionRequired` also warns that
 *   cancelling keeps the processing fee, while `rejected` names the refund and, when
 *   `retained` is above zero, the fee kept, and promises a further email (`refundIssued`).
 * - `statusLinkResent` tells the customer the previous link no longer works.
 * - `refundIssued` is the only email without a status link, hence without a button.
 */
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
          "Ihre Zahlung ist eingegangen. Ihre Karte wird belastet, sobald Ihr Antrag eingereicht ist, spätestens kurz vor Ablauf der Kartenreservierung. Scheitert er, erstatten wir den Betrag, gegebenenfalls abzüglich der Bearbeitungsgebühr.",
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
          "Auf Ihrer Statusseite korrigieren Sie die Angaben und reichen den Antrag erneut ein. Das kostet nichts extra.",
        ],
        note: `Sie können den Antrag dort auch stornieren. Wir behalten dann die Bearbeitungsgebühr von ${formatEuros(PROCESSING_FEE)} ein und erstatten den Rest.`,
        action: { label: "Antrag korrigieren", href: template.statusLink },
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
