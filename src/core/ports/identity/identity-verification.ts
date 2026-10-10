import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { Email } from "@/src/core/domain/customer/email"
import type { VerifiedPerson } from "@/src/core/domain/customer/verified-person"

export type VerificationResult =
  | { readonly status: "pending" }
  | { readonly status: "verified"; readonly person: VerifiedPerson }
  | { readonly status: "failed" }

export type IdentityNotification =
  | { readonly kind: "verificationChanged"; readonly reference: ApplicationReference }
  | { readonly kind: "ignored" }

// Only a fake so far: the Verimi adapter waits on launch plan Q1–Q3.
export interface IdentityVerification {
  start(input: { reference: ApplicationReference; email: Email }): Promise<{ verificationId: string; link: string }>
  getResult(verificationId: string): Promise<VerificationResult>
  // `payload` is the raw body: the signature covers its bytes.
  readNotification(payload: string, signature: string | null): IdentityNotification
}
