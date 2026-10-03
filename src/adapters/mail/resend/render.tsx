import { render } from "react-email"
import type { EmailTemplate } from "@/src/core/ports/mail/mailer"
import { copyFor } from "./copy"
import { EmailLayout } from "./email-layout"

/** One email as Resend takes it: a subject line and two bodies of the same content. */
export interface RenderedEmail {
  readonly subject: string
  readonly html: string
  readonly text: string
}

/**
 * HTML and a plain-text alternative of the same email, so both say the same thing.
 * The wording comes from `copyFor`, the markup from `EmailLayout`; both bodies render from
 * one element. A template without a status link (`refundIssued`) renders without a button.
 */
export async function renderEmail(template: EmailTemplate): Promise<RenderedEmail> {
  const { subject, ...content } = copyFor(template)
  const email = <EmailLayout {...content} />
  const [html, text] = await Promise.all([render(email), render(email, { plainText: true })])
  return { subject, html, text }
}
