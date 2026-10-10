import type { Mailer, MailMessage } from "@/src/core/ports/mail/mailer"

const MASKED_TOKEN = "[status token hidden outside dev]"
const MASKED_VERIFICATION_LINK = "[verification link hidden outside dev]"

export class ConsoleMailer implements Mailer {
  private readonly revealStatusLinks: boolean
  private readonly log: (line: string) => void

  constructor({ revealStatusLinks, log = console.info }: { revealStatusLinks: boolean; log?: (line: string) => void }) {
    this.revealStatusLinks = revealStatusLinks
    this.log = log
  }

  async send({ to, template }: MailMessage): Promise<void> {
    const { name, ...data } = template
    // Relies on the container building the link as .../status/<token>.
    if ("statusLink" in data && !this.revealStatusLinks) data.statusLink = data.statusLink.replace(/[^/]+$/, MASKED_TOKEN)
    if ("verificationLink" in data && !this.revealStatusLinks) data.verificationLink = MASKED_VERIFICATION_LINK
    this.log(`[mail] ${name} → ${to} ${JSON.stringify(data)}`)
  }
}
