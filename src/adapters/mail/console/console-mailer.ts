import type { Mailer, MailMessage } from "@/src/core/ports/mailer"

const MASKED_TOKEN = "[status token hidden outside dev]"

/**
 * `MAIL_DRIVER=console`: prints instead of sending. In dev it prints the status
 * link on purpose, since that is the only way to open the status page locally.
 * Any other stage masks the token: its logs are kept by the platform, and a
 * status token there is a live key to a customer's order. Templates carry no
 * security code to print.
 *
 * Only the token is masked: the recipient address and the rest of the template data
 * (order reference, reason, amounts) are printed in every stage. The environment check
 * refuses this driver in production. It does not track idempotency keys, so a retried send
 * prints again where `ResendMailer` would deliver once.
 */
export class ConsoleMailer implements Mailer {
  private readonly revealStatusLinks: boolean
  private readonly log: (line: string) => void

  /**
   * `revealStatusLinks` is true only in dev; the container derives it from `APP_ENV`.
   * `log` defaults to `console.info` and exists so a test can capture the lines.
   */
  constructor({ revealStatusLinks, log = console.info }: { revealStatusLinks: boolean; log?: (line: string) => void }) {
    this.revealStatusLinks = revealStatusLinks
    this.log = log
  }

  /** Prints one `[mail]` line: template name, recipient and the other template fields as JSON. */
  async send({ to, template }: MailMessage): Promise<void> {
    const { name, ...data } = template
    // The token is the last path segment of the link the container builds (/status/<token>).
    if ("statusLink" in data && !this.revealStatusLinks) data.statusLink = data.statusLink.replace(/[^/]+$/, MASKED_TOKEN)
    this.log(`[mail] ${name} → ${to} ${JSON.stringify(data)}`)
  }
}
