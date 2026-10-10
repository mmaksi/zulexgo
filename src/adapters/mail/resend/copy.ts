import type { OrderableService } from "@/src/core/domain/application/service"
import { PROCESSING_FEE } from "@/src/core/domain/payment/pricing"
import { NEW_REGISTRATION_NEXT_STEPS } from "@/src/core/domain/registration/new-registration-next-steps"
import { SUPPORT_EMAIL } from "@/src/core/domain/customer/contact"
import { formatEuros } from "@/src/core/domain/payment/money"
import type { EmailTemplate } from "@/src/core/ports/mail/mailer"

// Reasons come from our rejection catalogue (launch plan Q10); vendor text never reaches a customer.
export interface EmailCopy {
  readonly subject: string
  readonly preview: string
  readonly heading: string
  readonly paragraphs: readonly string[]
  readonly note?: string
  readonly action?: { readonly label: string; readonly href: string }
}

const REFUND_TIMEFRAME = "Je nach Bank ist der Betrag in 3 bis 5 Werktagen auf Ihrem Konto."

const CANCEL_NOTE = `Sie können den Antrag dort auch stornieren. Wir behalten dann die Bearbeitungsgebühr von ${formatEuros(PROCESSING_FEE)} ein und erstatten den Rest.`

// Two formats joined by hand: Intl's combined date-time pattern differs between Node versions.
function formatDeadline(deadline: Date): string {
  const berlin = { timeZone: "Europe/Berlin" } as const
  const day = new Intl.DateTimeFormat("de-DE", { ...berlin, day: "numeric", month: "long", year: "numeric" }).format(deadline)
  const time = new Intl.DateTimeFormat("de-DE", { ...berlin, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(deadline)
  return `${day}, ${time} Uhr`
}

type ServiceEmail = Extract<EmailTemplate, { service: OrderableService }>

const SERVICE_COPY: Record<OrderableService, (template: ServiceEmail) => EmailCopy> = {
  deregistration: deregistrationCopy,
  newRegistration: newRegistrationCopy,
}

export function copyFor(template: EmailTemplate): EmailCopy {
  const { reference } = template

  switch (template.name) {
    case "orderConfirmation":
    case "submittedToKba":
    case "completed":
    case "correctionRequired":
    case "rejected":
      return SERVICE_COPY[template.service](template)
    case "identityVerificationRequested":
      return {
        subject: `Bitte bestätigen Sie Ihre Identität: Antrag ${reference}`,
        preview: "Ohne Bestätigung reichen wir Ihren Antrag nicht ein.",
        heading: "Bitte bestätigen Sie Ihre Identität",
        paragraphs: [
          "Ihre Zahlung ist eingegangen. Bevor wir Ihren Antrag einreichen, müssen Sie Ihre Identität bestätigen. Das dauert wenige Minuten. Halten Sie Ihren Ausweis bereit.",
          `Bitte schließen Sie die Prüfung bis ${formatDeadline(template.deadline)} ab. Danach stornieren wir den Auftrag und Sie erhalten den vollen Betrag zurück.`,
        ],
        action: { label: "Identität bestätigen", href: template.verificationLink },
      }
    case "identityVerificationReminder":
      return {
        subject: `Erinnerung: Identität bestätigen, Antrag ${reference}`,
        preview: "Wir reichen Ihren Antrag erst nach der Bestätigung ein.",
        heading: "Bitte bestätigen Sie Ihre Identität",
        paragraphs: [
          "Wir haben noch keine Bestätigung Ihrer Identität erhalten. Ohne sie können wir Ihren Antrag nicht einreichen.",
          `Bitte schließen Sie die Prüfung bis ${formatDeadline(template.deadline)} ab, sonst stornieren wir den Auftrag und Sie erhalten den vollen Betrag zurück.`,
        ],
        action: { label: "Identität bestätigen", href: template.verificationLink },
      }
    case "identityVerified":
      return {
        subject: `Ihre Identität ist bestätigt: Antrag ${reference}`,
        preview: "Wir reichen Ihren Antrag jetzt ein.",
        heading: "Ihre Identität ist bestätigt",
        paragraphs: [
          "Vielen Dank, die Prüfung war erfolgreich. Wir reichen Ihren Antrag jetzt beim Kraftfahrt-Bundesamt (KBA) ein.",
          "Sobald es Neuigkeiten gibt, schreiben wir Ihnen.",
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

function deregistrationCopy(template: ServiceEmail): EmailCopy {
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
        note: CANCEL_NOTE,
        action: { label: "Antrag korrigieren", href: template.statusLink },
      }
    case "rejected":
      return {
        subject: `Ihr Antrag ${reference} wurde abgelehnt`,
        preview: "Wir erstatten Ihnen den Betrag.",
        heading: "Ihr Antrag wurde abgelehnt",
        paragraphs: [
          `${template.reason} Der Antrag zu Auftrag ${reference} konnte nicht abgeschlossen werden. Eine Korrektur ist nicht möglich; für die Abmeldung wäre ein neuer Antrag nötig.`,
          refundSentence(template),
        ],
        action: { label: "Status ansehen", href: template.statusLink },
      }
  }
}

function refundSentence(template: Extract<EmailTemplate, { name: "rejected" }>): string {
  return template.retained.cents > 0
    ? `Sie erhalten ${formatEuros(template.refund)} zurück. Die Bearbeitungsgebühr von ${formatEuros(template.retained)} behalten wir ein. Eine weitere E-Mail bestätigt die Erstattung.`
    : `Sie erhalten ${formatEuros(template.refund)} zurück. Eine weitere E-Mail bestätigt die Erstattung.`
}

function newRegistrationCopy(template: ServiceEmail): EmailCopy {
  const { reference } = template

  switch (template.name) {
    case "orderConfirmation":
      return {
        subject: `Ihr ZulexGO-Antrag ${reference} ist eingegangen`,
        preview: "Wir haben Ihren Antrag erhalten.",
        heading: "Ihr Antrag ist eingegangen",
        paragraphs: [
          `Vielen Dank für Ihre Neuzulassung. Ihre Auftragsnummer lautet ${reference}.`,
          "Ihre Zahlung ist eingegangen. Ihre Karte wird belastet, sobald Ihr Antrag eingereicht ist, spätestens kurz vor Ablauf der Kartenreservierung. Scheitert er, erstatten wir den Betrag, gegebenenfalls abzüglich der Bearbeitungsgebühr.",
          "Als Nächstes bestätigen Sie Ihre Identität; dazu folgt gleich eine E-Mail. Erst danach reichen wir den Antrag ein.",
          "Über Ihren persönlichen Link sehen Sie den Stand. Geben Sie ihn bitte nicht weiter.",
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
            ? "Ihre Zulassungsstelle bearbeitet Zulassungen von Hand. Das kann einige Tage dauern."
            : "Ihre Zulassungsstelle bearbeitet Zulassungen online. Meist ist Ihr Antrag in wenigen Minuten bis Stunden erledigt.",
          "Sobald es Neuigkeiten gibt, schreiben wir Ihnen.",
        ],
        action: { label: "Status ansehen", href: template.statusLink },
      }
    case "completed":
      return {
        subject: `Geschafft! Ihr Antrag ${reference} ist abgeschlossen ✓`,
        preview: "Ihre Neuzulassung ist abgeschlossen.",
        heading: "Ihre Neuzulassung ist abgeschlossen",
        paragraphs: [
          "Das KBA hat Ihre Neuzulassung bestätigt. Herzlichen Glückwunsch! Ihre Unterlagen können Sie auf Ihrer Statusseite herunterladen.",
          ...NEW_REGISTRATION_NEXT_STEPS,
        ],
        action: { label: "Unterlagen ansehen", href: template.statusLink },
      }
    case "correctionRequired":
      return template.identityMismatch
        ? {
            subject: `Ihr Antrag ${reference} braucht eine Korrektur`,
            preview: "Ihre Angaben passen nicht zu Ihrem Ausweis.",
            heading: "Ihr Antrag braucht eine Korrektur",
            paragraphs: [
              `${template.reason} Wir haben noch nichts eingereicht.`,
              "Auf Ihrer Statusseite korrigieren Sie die Angaben. Wir prüfen Ihre Identität dann erneut. Das kostet nichts extra.",
            ],
            note: CANCEL_NOTE,
            action: { label: "Antrag korrigieren", href: template.statusLink },
          }
        : {
            subject: `Ihr Antrag ${reference} braucht eine Korrektur`,
            preview: "Die Zulassungsstelle konnte den Antrag so nicht bearbeiten.",
            heading: "Ihr Antrag braucht eine Korrektur",
            paragraphs: [
              `${template.reason} Das lässt sich meist korrigieren.`,
              "Auf Ihrer Statusseite korrigieren Sie die eVB-Nummer oder die Angaben zur Zulassungsbescheinigung Teil II und reichen den Antrag erneut ein. Das kostet nichts extra.",
            ],
            note: CANCEL_NOTE,
            action: { label: "Antrag korrigieren", href: template.statusLink },
          }
    case "rejected":
      return {
        subject: `Ihr Antrag ${reference} wurde abgelehnt`,
        preview: "Wir erstatten Ihnen den Betrag.",
        heading: "Ihr Antrag wurde abgelehnt",
        paragraphs: [
          `${template.reason} Der Antrag zu Auftrag ${reference} konnte nicht abgeschlossen werden. Eine Korrektur ist nicht möglich; für die Neuzulassung wäre ein neuer Antrag nötig.`,
          refundSentence(template),
        ],
        action: { label: "Status ansehen", href: template.statusLink },
      }
  }
}
