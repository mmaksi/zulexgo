import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { IdentityVerification, VerificationResult } from "@/src/core/ports/identity/identity-verification"

/**
 * In-memory stand-in for Verimi; `customerFinishes` plays the customer at the provider.
 * Wired in every stage for now, since the verification step is not yet in the flow (the
 * real adapter waits on launch plan Q1–Q4). No network and no email: `start` ignores the
 * address, and the link points at a reserved `.test` host, so nothing can follow it. State
 * lives in the instance, and ids are numbered per instance.
 */
export class FakeIdentityVerification implements IdentityVerification {
  private readonly byReference = new Map<ApplicationReference, string>()
  private readonly results = new Map<string, VerificationResult>()

  /** One verification per reference: a repeat returns the first one, with the same link. */
  async start({ reference }: Parameters<IdentityVerification["start"]>[0]) {
    const verificationId = this.byReference.get(reference) ?? this.open(reference)
    return { verificationId, link: `https://verification.example.test/${verificationId}` }
  }

  /** Throws a plain `Error` for an id this instance never issued; the port leaves that open. */
  async getResult(verificationId: string): Promise<VerificationResult> {
    const result = this.results.get(verificationId)
    if (!result) throw new Error(`FakeIdentityVerification: unknown verification ${verificationId}`)
    return result
  }

  /**
   * Test and dev hook, not part of the port. Settles a pending verification; a later call, or
   * one for an unknown id, changes nothing, so a result never changes once set.
   */
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
