import type { Mailer, MailMessage } from "@/src/core/ports/mailer"

/**
 * Records every message so tests can assert which emails went out, and how
 * many. Like the real mailer it delivers a message once per idempotency key.
 */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = []
  private readonly keys = new Set<string>()

  async send(message: MailMessage): Promise<void> {
    if (this.keys.has(message.idempotencyKey)) return
    this.keys.add(message.idempotencyKey)
    this.sent.push(message)
  }
}
