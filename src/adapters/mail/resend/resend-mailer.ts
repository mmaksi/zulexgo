import { Resend } from "resend"
import type { Mailer, MailMessage } from "@/src/core/ports/mailer"
import { renderEmail } from "./render"

/**
 * `Mailer` on Resend. On staging it is given the allowlist and drops every
 * other recipient before calling Resend, so seeded data never reaches a real
 * inbox. Production has no allowlist; dev never builds this adapter.
 *
 * Each message is rendered to German HTML and plain text (`renderEmail`) and sent from
 * `config.from`. The message's idempotency key goes to Resend, which then delivers a
 * retried send once. Resend keeps a key for only 24 hours, so that holds for retries inside
 * that window, and the same key with different content is refused rather than resent.
 */
export class ResendMailer implements Mailer {
  private readonly resend: Resend
  private readonly allowlist?: ReadonlySet<string>
  private readonly log: (line: string) => void

  /**
   * `allowlist` addresses are compared case-insensitively; leave it out to send to anyone.
   * `log` takes the drop notices and defaults to `console.info`.
   */
  constructor(
    private readonly config: { apiKey: string; from: string; allowlist?: readonly string[]; log?: (line: string) => void },
  ) {
    // Explicit, so a stray RESEND_BASE_URL in the environment cannot redirect mail.
    this.resend = new Resend(config.apiKey, { baseUrl: "https://api.resend.com" })
    this.allowlist = config.allowlist && new Set(config.allowlist.map((address) => address.toLowerCase()))
    this.log = config.log ?? console.info
  }

  /**
   * Resolves once Resend accepts the message, or once it is dropped for a recipient off the
   * allowlist (logged without the address, and not an error: see `Mailer`). Any refusal by
   * Resend throws a plain `Error` naming the template and Resend's error name; it does not
   * tell a retryable failure from a permanent one, and a caller retries with the same key.
   */
  async send({ to, template, idempotencyKey }: MailMessage): Promise<void> {
    if (this.allowlist && !this.allowlist.has(to.toLowerCase())) {
      this.log(`[mail] ${template.name} dropped: recipient is not on MAIL_ALLOWLIST`)
      return
    }

    const { subject, html, text } = await renderEmail(template)
    // The SDK returns errors instead of throwing them.
    const { error } = await this.resend.emails.send({ from: this.config.from, to: [to], subject, html, text }, { idempotencyKey })
    if (error) throw new Error(`Resend did not accept ${template.name}: ${error.name}`)
  }
}
