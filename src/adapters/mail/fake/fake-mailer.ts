import type { Mailer, MailMessage } from "@/src/core/ports/mail/mailer"

// Mirrors Resend's 409 on a reused key with other content, but never forgets a key (Resend: 24 hours).
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = []
  private readonly contents = new Map<string, string>()

  async send(message: MailMessage): Promise<void> {
    const content = JSON.stringify({ to: message.to, template: message.template })
    const earlier = this.contents.get(message.idempotencyKey)
    if (earlier !== undefined) {
      if (earlier !== content) throw new Error(`FakeMailer: idempotency key ${message.idempotencyKey} was already sent with other content`)
      return
    }
    this.contents.set(message.idempotencyKey, content)
    this.sent.push(message)
  }
}
