import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { Email } from "@/src/core/domain/customer/email"

/** `pending` until the customer finishes at the provider; `verified` and `failed` are final. */
export type VerificationResult = "pending" | "verified" | "failed"

/**
 * Proves the customer is who they say they are (Verimi: selfie and ID-card
 * scan). Not yet part of the flow: Verimi is added later, once the founder
 * answers launch plan Q1–Q4, and its two statuses then slot in after
 * `submitted_and_paid`.
 *
 * Guarantees every adapter must honour:
 * - `start` for a reference already started returns the same verification, so
 *   a retried step never sends the customer a second link.
 * - A verification is `pending` until the customer finishes it, then
 *   `verified` or `failed`, and never changes again.
 * - The link is https: it carries the customer to a third party.
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
}
