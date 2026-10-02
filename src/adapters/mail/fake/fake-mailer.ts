import type { Mailer, MailMessage } from "@/src/core/ports/mailer"

/**
 * Records every message so tests can assert which emails went out, and how
 * many. Like the real mailer it delivers a message once per idempotency key.
 *
 * Tests only; the container never wires it (dev prints with `ConsoleMailer`). It records
 * the template data, not rendered HTML, so assertions read fields such as `name` or
 * `statusLink`; the markup is covered by the Resend adapter's render tests. Unlike Resend,
 * which forgets a key after 24 hours, it remembers every key for the life of the instance.
 */
export class FakeMailer implements Mailer {
  /** Delivered messages in send order; a repeat of an idempotency key is not added. */
  readonly sent: MailMessage[] = []
  private readonly keys = new Set<string>()

  async send(message: MailMessage): Promise<void> {
    if (this.keys.has(message.idempotencyKey)) return
    this.keys.add(message.idempotencyKey)
    this.sent.push(message)
  }
}
