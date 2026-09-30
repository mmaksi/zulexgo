import { render } from "react-email"
import type { EmailTemplate } from "@/src/core/ports/mailer"
import { copyFor } from "./copy"
import { EmailLayout } from "./email-layout"

export interface RenderedEmail {
  readonly subject: string
  readonly html: string
  readonly text: string
}

/** HTML and a plain-text alternative of the same email, so both say the same thing. */
export async function renderEmail(template: EmailTemplate): Promise<RenderedEmail> {
  const { subject, ...content } = copyFor(template)
  const email = <EmailLayout {...content} />
  const [html, text] = await Promise.all([render(email), render(email, { plainText: true })])
  return { subject, html, text }
}
