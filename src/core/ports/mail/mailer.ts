import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { OrderableService } from "@/src/core/domain/application/service"
import type { Email } from "@/src/core/domain/customer/email"
import type { Money } from "@/src/core/domain/payment/money"

// No template has a field for a security code: one must never reach an email.
export type EmailTemplate =
  | { readonly name: "orderConfirmation"; readonly service: OrderableService; readonly reference: ApplicationReference; readonly statusLink: string }
  | { readonly name: "identityVerificationRequested"; readonly reference: ApplicationReference; readonly verificationLink: string; readonly deadline: Date }
  | { readonly name: "identityVerificationReminder"; readonly reference: ApplicationReference; readonly verificationLink: string; readonly deadline: Date }
  | { readonly name: "identityVerified"; readonly reference: ApplicationReference; readonly statusLink: string }
  | {
      readonly name: "submittedToKba"
      readonly service: OrderableService
      readonly reference: ApplicationReference
      readonly statusLink: string
      readonly manualProcessing: boolean
    }
  | { readonly name: "completed"; readonly service: OrderableService; readonly reference: ApplicationReference; readonly statusLink: string }
  | {
      readonly name: "correctionRequired"
      readonly service: OrderableService
      readonly reference: ApplicationReference
      readonly statusLink: string
      readonly reason: string
      // Provisional, launch plan Q47: the verified person is not the order's owner, so nothing was filed.
      readonly identityMismatch?: boolean
    }
  | {
      readonly name: "rejected"
      readonly service: OrderableService
      readonly reference: ApplicationReference
      readonly statusLink: string
      readonly reason: string
      readonly refund: Money
      readonly retained: Money
    }
  | { readonly name: "refundIssued"; readonly reference: ApplicationReference; readonly amount: Money }
  | { readonly name: "statusLinkResent"; readonly reference: ApplicationReference; readonly statusLink: string }

export interface MailMessage {
  readonly to: Email
  readonly template: EmailTemplate
  readonly idempotencyKey: string
}

export interface Mailer {
  // Must reject when not accepted: callers send before saving a status. Resend keeps a key 24 hours only.
  send(message: MailMessage): Promise<void>
}
