import type { Mailer, MailMessage } from "@/src/core/ports/mailer"

/**
 * Dev's mailer (`MAIL_DRIVER=console`): every address there is seeded, so none
 * is mailed for real. Prints the status link on purpose — it is the only way to
 * open the status page locally. Templates carry no security code to print.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = console.info) {}

  async send({ to, template }: MailMessage): Promise<void> {
    const { name, ...data } = template
    this.log(`[mail] ${name} → ${to} ${JSON.stringify(data)}`)
  }
}
