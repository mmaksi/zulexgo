import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { IdentityVerification, VerificationResult } from "@/src/core/ports/identity-verification"

/** In-memory stand-in for Verimi; `customerFinishes` plays the customer at the provider. */
export class FakeIdentityVerification implements IdentityVerification {
  private readonly byReference = new Map<ApplicationReference, string>()
  private readonly results = new Map<string, VerificationResult>()

  async start({ reference }: Parameters<IdentityVerification["start"]>[0]) {
    const verificationId = this.byReference.get(reference) ?? this.open(reference)
    return { verificationId, link: `https://verification.example.test/${verificationId}` }
  }

  async getResult(verificationId: string): Promise<VerificationResult> {
    const result = this.results.get(verificationId)
    if (!result) throw new Error(`FakeIdentityVerification: unknown verification ${verificationId}`)
    return result
  }

  async customerFinishes(verificationId: string, outcome: "verified" | "failed"): Promise<void> {
    if (this.results.get(verificationId) === "pending") this.results.set(verificationId, outcome)
  }

  private open(reference: ApplicationReference): string {
    const verificationId = `fake-verification-${this.byReference.size + 1}`
    this.byReference.set(reference, verificationId)
    this.results.set(verificationId, "pending")
    return verificationId
  }
}
