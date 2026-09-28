import type { Money } from "@/src/core/domain/money"
import type { EmailTemplate } from "@/src/core/ports/mailer"

/**
 * Plain HTML and text for each email. M4 needs the order confirmation and a
 * generic status change; the reviewed German copy of every email (launch plan
 * M5) replaces these.
 */
export interface RenderedEmail {
  readonly subject: string
  readonly html: string
  readonly text: string
}

const euros = (money: Money) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(money.cents / 100)

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

function layout(heading: string, paragraphs: string[], action?: { label: string; href: string }): Omit<RenderedEmail, "subject"> {
  const button = action
    ? `<p><a href="${escape(action.href)}" style="display:inline-block;padding:12px 24px;background:#F49405;color:#272828;text-decoration:none;border-radius:4px">${escape(action.label)}</a></p>`
    : ""
  const html = [
    `<div style="font-family:Arial,sans-serif;color:#444C54;max-width:560px">`,
    `<h1 style="font-size:20px;color:#272828">${escape(heading)}</h1>`,
    ...paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`),
    button,
    `<p style="font-size:13px;color:#58626D">ZulexGO</p>`,
    `</div>`,
  ].join("")
  const text = [heading, ...paragraphs, ...(action ? [`${action.label}: ${action.href}`] : []), "ZulexGO"].join("\n\n")
  return { html, text }
}

export function renderEmail(template: EmailTemplate): RenderedEmail {
  switch (template.name) {
    case "orderConfirmation":
      return {
        subject: `Ihr Antrag ${template.reference} ist eingegangen`,
        ...layout(
          "Vielen Dank, Ihr Antrag ist eingegangen",
          [
            `Ihr Antrag auf Außerbetriebsetzung mit der Auftragsnummer ${template.reference} und Ihre Zahlung sind bei uns eingegangen.`,
            "Über den Link sehen Sie jederzeit, wie weit Ihr Antrag ist. Er ist nur für Sie bestimmt: Bitte geben Sie ihn nicht weiter.",
          ],
          { label: "Status ansehen", href: template.statusLink },
        ),
      }
    case "refundIssued":
      return {
        subject: `Ihre Erstattung zu ${template.reference} ist unterwegs`,
        ...layout("Ihre Erstattung ist unterwegs", [
          `Wir haben Ihnen ${euros(template.amount)} zu Auftrag ${template.reference} erstattet.`,
          "Je nach Bank ist der Betrag in 3 bis 5 Werktagen auf Ihrem Konto.",
        ]),
      }
    default:
      return {
        subject: `Neuigkeiten zu Ihrem Antrag ${template.reference}`,
        ...layout(
          "Ihr Antrag hat einen neuen Stand",
          [`Der Stand Ihres Antrags ${template.reference} hat sich geändert. Die Einzelheiten finden Sie auf Ihrer Statusseite.`],
          { label: "Status ansehen", href: template.statusLink },
        ),
      }
  }
}
