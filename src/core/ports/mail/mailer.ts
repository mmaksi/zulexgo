import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { Email } from "@/src/core/domain/customer/email"
import type { Money } from "@/src/core/domain/payment/money"

/**
 * The customer emails of business logic §5, without Verimi's two. Each carries
 * only what its email shows, so a security code has nowhere to go: the types
 * leave no field for one. Rendering to HTML is the adapter's job.
 */
export type EmailTemplate =
  /** Email 1: the payment is in and the order exists; carries the status link. */
  | { readonly name: "orderConfirmation"; readonly reference: ApplicationReference; readonly statusLink: string }
  /** Email 4: submitted to the KBA, whose answer is awaited. Sent again after a correction. */
  | {
      readonly name: "submittedToKba"
      readonly reference: ApplicationReference
      readonly statusLink: string
      /** The authority is not online: processing is manual and can take days. */
      readonly manualProcessing: boolean
    }
  /** Email 5a: the KBA confirmed the de-registration; the confirmation is on the status page. */
  | { readonly name: "completed"; readonly reference: ApplicationReference; readonly statusLink: string }
  /** Email 5b: the order failed but can still be corrected or cancelled by the customer. */
  | {
      readonly name: "correctionRequired"
      readonly reference: ApplicationReference
      readonly statusLink: string
      /** What went wrong, in our words (the rejection catalogue), never the vendor's. */
      readonly reason: string
    }
  /** Email 5c: the order failed for good; says what goes back and what is kept. */
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
  /** Email 6: one per order however the refund is reached. Carries the amount, no status link. */
  | { readonly name: "refundIssued"; readonly reference: ApplicationReference; readonly amount: Money }
  /** Not in the business logic document: the recovery for a lost link (launch plan M5). */
  | { readonly name: "statusLinkResent"; readonly reference: ApplicationReference; readonly statusLink: string }

/** One email to one recipient: what to send and the key that makes sending it repeatable. */
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
  /**
   * Rejects when the message is not accepted (the Resend adapter throws a plain
   * `Error`). The use cases that send before saving a status rely on it: a
   * failed send leaves the order at its old status, which the poller backs off,
   * and a later poll sends again under the same key. The real adapter passes the key to the provider, which remembers
   * it only for a limited time (Resend: 24 hours); the fake remembers it for
   * its own lifetime.
   */
  send(message: MailMessage): Promise<void>
}
