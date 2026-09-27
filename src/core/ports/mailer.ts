import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { Email } from "@/src/core/domain/email"
import type { Money } from "@/src/core/domain/money"

/**
 * The customer emails of business logic §5, without Verimi's two. Each carries
 * only what its email shows, so a security code has nowhere to go: the types
 * leave no field for one. Rendering to HTML is the adapter's job.
 */
export type EmailTemplate =
  | { readonly name: "orderConfirmation"; readonly reference: ApplicationReference; readonly statusLink: string }
  | {
      readonly name: "submittedToKba"
      readonly reference: ApplicationReference
      readonly statusLink: string
      /** The authority is not online: processing is manual and can take days. */
      readonly manualProcessing: boolean
    }
  | { readonly name: "completed"; readonly reference: ApplicationReference; readonly statusLink: string }
  | { readonly name: "correctionRequired"; readonly reference: ApplicationReference; readonly statusLink: string }
  | {
      readonly name: "rejected"
      readonly reference: ApplicationReference
      readonly statusLink: string
      readonly refund: Money
    }
  | { readonly name: "refundIssued"; readonly reference: ApplicationReference; readonly amount: Money }

export interface MailMessage {
  readonly to: Email
  readonly template: EmailTemplate
}

/**
 * Sends one customer email. Guarantees every adapter must honour:
 * - Every template can be sent.
 * - `send` resolves only once the message is accepted for delivery, or, where a
 *   stage forbids real mail (dev) or the recipient is not allowed (staging), once
 *   it is deliberately dropped. It never silently fails.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>
}
