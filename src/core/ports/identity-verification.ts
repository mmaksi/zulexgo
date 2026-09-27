import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { Email } from "@/src/core/domain/email"

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
  start(input: { reference: ApplicationReference; email: Email }): Promise<{ verificationId: string; link: string }>
  getResult(verificationId: string): Promise<VerificationResult>
}
