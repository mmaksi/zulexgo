import type { Mailer, MailMessage } from "@/src/core/ports/mail/mailer"

/**
 * Records every message so tests can assert which emails went out, and how
 * many. Like the real mailer it delivers a message once per idempotency key,
 * and refuses a key it already holds with other content (Resend answers 409),
 * so a retry that rebuilds its email differently fails in a test as it would in production.
 *
 * Tests only; the container never wires it (dev prints with `ConsoleMailer`). It records
 * the template data, not rendered HTML, so assertions read fields such as `name` or
 * `statusLink`; the markup is covered by the Resend adapter's render tests. Unlike Resend,
 * which forgets a key after 24 hours, it remembers every key for the life of the instance.
 */
export class FakeMailer implements Mailer {
  /** Delivered messages in send order; a repeat of an idempotency key is not added. */
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
