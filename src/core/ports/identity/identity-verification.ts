import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { Email } from "@/src/core/domain/customer/email"
import type { VerifiedPerson } from "@/src/core/domain/customer/verified-person"

/**
 * `pending` until the customer finishes at the provider; `verified` (naming the person the provider's
 * check read off the document, which the caller compares with the owner on the order) and `failed` are final.
 */
export type VerificationResult =
  | { readonly status: "pending" }
  | { readonly status: "verified"; readonly person: VerifiedPerson }
  | { readonly status: "failed" }

/**
 * What a provider notification means for an order. `verificationChanged`: the customer finished or
 * the provider has news, so the order's verification should be looked at (the notification itself
 * never says how it ended: the outcome is read with `getResult`). Everything else is not acted on.
 */
export type IdentityNotification =
  | { readonly kind: "verificationChanged"; readonly reference: ApplicationReference }
  | { readonly kind: "ignored" }

/**
 * Proves the customer is who they say they are (Verimi: selfie and ID-card scan), for the services that
 * verify before anything is filed (Neuzulassung). The only adapter is the fake: the Verimi adapter waits
 * on launch plan Q1–Q3 and a source for Verimi's API, and production refuses the fake while a service that
 * verifies is on sale.
 *
 * Guarantees every adapter must honour:
 * - `start` for a reference already started returns the same verification, so
 *   a retried step never sends the customer a second link.
 * - A verification is `pending` until the customer finishes it, then
 *   `verified` or `failed`, and never changes again.
 * - The link is https: it carries the customer to a third party.
 * - `readNotification` trusts only a payload signed by the provider; anything
 *   unsigned or altered throws `NotificationRejected`. The same notification
 *   may arrive twice, so acting on it must be safe to repeat.
 */
export interface IdentityVerification {
  /**
   * Opens the order's verification, or returns the one already open for that
   * reference, with the same id and link. `verificationId` is what `getResult`
   * is asked about; `link` is where the customer goes to verify.
   */
  start(input: { reference: ApplicationReference; email: Email }): Promise<{ verificationId: string; link: string }>
  /**
   * Reports `failed` rather than throwing: turning it into
   * `IdentityVerificationFailed` is the caller's job. The fake rejects an id it
   * never issued instead of reading it as `pending`.
   */
  getResult(verificationId: string): Promise<VerificationResult>
  /**
   * Synchronous. `payload` is the request body exactly as received, since the signature covers its
   * bytes; `signature` is the provider's signature header, or `null` when the request had none.
   */
  readNotification(payload: string, signature: string | null): IdentityNotification
}
