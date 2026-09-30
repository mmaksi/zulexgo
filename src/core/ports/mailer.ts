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
  | {
      readonly name: "correctionRequired"
      readonly reference: ApplicationReference
      readonly statusLink: string
      /** What went wrong, in our words (the rejection catalogue), never the vendor's. */
      readonly reason: string
    }
  | {
      readonly name: "rejected"
      readonly reference: ApplicationReference
      readonly statusLink: string
      /** What went wrong, in our words (the rejection catalogue), never the vendor's. */
      readonly reason: string
      /** What goes back to the customer. */
      readonly refund: Money
      /** What we keep of the payment: the processing fee, or nothing when the failure was ours. */
      readonly retained: Money
    }
  | { readonly name: "refundIssued"; readonly reference: ApplicationReference; readonly amount: Money }
  /** Not in the business logic document: the recovery for a lost link (launch plan M5). */
  | { readonly name: "statusLinkResent"; readonly reference: ApplicationReference; readonly statusLink: string }

export interface MailMessage {
  readonly to: Email
  readonly template: EmailTemplate
  /** One per email the customer should get: a retried send with the same key is delivered once. */
  readonly idempotencyKey: string
}

/**
 * Sends one customer email. Guarantees every adapter must honour:
 * - Every template can be sent.
 * - A message whose idempotency key was already sent is not delivered again.
 * - `send` resolves only once the message is accepted for delivery, or, where a
 *   stage forbids real mail (dev) or the recipient is not allowed (staging), once
 *   it is deliberately dropped. It never silently fails.
 */
export interface Mailer {
  send(message: MailMessage): Promise<void>
}
