import type { Mailer, MailMessage } from "@/src/core/ports/mailer"

/** Records every message so tests can assert which emails went out, and how many. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = []

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message)
  }
}
