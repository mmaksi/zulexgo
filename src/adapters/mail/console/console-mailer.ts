import type { Mailer, MailMessage } from "@/src/core/ports/mailer"

const MASKED_TOKEN = "[status token hidden outside dev]"

/**
 * `MAIL_DRIVER=console`: prints instead of sending. In dev it prints the status
 * link on purpose, since that is the only way to open the status page locally.
 * Any other stage masks the token: its logs are kept by the platform, and a
 * status token there is a live key to a customer's order. Templates carry no
 * security code to print.
 */
export class ConsoleMailer implements Mailer {
  private readonly revealStatusLinks: boolean
  private readonly log: (line: string) => void

  constructor({ revealStatusLinks, log = console.info }: { revealStatusLinks: boolean; log?: (line: string) => void }) {
    this.revealStatusLinks = revealStatusLinks
    this.log = log
  }

  async send({ to, template }: MailMessage): Promise<void> {
    const { name, ...data } = template
    if ("statusLink" in data && !this.revealStatusLinks) data.statusLink = data.statusLink.replace(/[^/]+$/, MASKED_TOKEN)
    this.log(`[mail] ${name} → ${to} ${JSON.stringify(data)}`)
  }
}
