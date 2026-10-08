import { createHmac, timingSafeEqual } from "node:crypto"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { IdentityNotification, IdentityVerification, VerificationResult } from "@/src/core/ports/identity/identity-verification"

const SIGNING_SECRET = "fake-identity-notification-secret"

const sign = (payload: string) => createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex")

/**
 * In-memory stand-in for Verimi; `customerFinishes` plays the customer at the provider.
 * Wired in dev and staging (`IDENTITY_DRIVER=fake`); production refuses it while a service that verifies
 * the customer is on sale, since a fake proves nobody's identity. No network and no email: `start` ignores the
 * address, and the link points at a reserved `.test` host, so nothing can follow it. State
 * lives in the instance, and ids are numbered per instance: right for tests and a single dev process, wrong for a
 * deployment that runs several instances (one would not know a verification another started), which is another
 * reason a service that verifies customers needs the real adapter before it is sold.
 */
export class FakeIdentityVerification implements IdentityVerification {
  private readonly byReference = new Map<ApplicationReference, string>()
  private readonly references = new Map<string, ApplicationReference>()
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
   * Accepts only a payload signed with the fake's secret, compared in constant time; a missing or wrong
   * signature is `NotificationRejected`. A `verificationChanged` event names the order, and any other type is ignored.
   */
  readNotification(payload: string, signature: string | null): IdentityNotification {
    const expected = Buffer.from(sign(payload))
    const given = Buffer.from(signature ?? "")
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new NotificationRejected()

    const { type, reference } = JSON.parse(payload)
    return type === "verificationChanged" ? { kind: "verificationChanged", reference } : { kind: "ignored" }
  }

  /**
   * Test and dev hook, not part of the port. Settles a pending verification; a later call, or
   * one for an unknown id, changes nothing, so a result never changes once set.
   */
  async customerFinishes(verificationId: string, finish: Exclude<VerificationResult, { status: "pending" }>): Promise<void> {
    if (this.results.get(verificationId)?.status === "pending") this.results.set(verificationId, finish)
  }

  /**
   * Test and dev hook, not part of the port. What the provider would send for this verification,
   * signed as `readNotification` accepts it. Not tied to a finished verification, so a test can send it early.
   */
  notificationOf(verificationId: string): { payload: string; signature: string } {
    const reference = this.references.get(verificationId)
    if (!reference) throw new Error(`FakeIdentityVerification: unknown verification ${verificationId}`)
    const payload = JSON.stringify({ type: "verificationChanged", reference })
    return { payload, signature: sign(payload) }
  }

  private open(reference: ApplicationReference): string {
    const verificationId = `fake-verification-${this.byReference.size + 1}`
    this.byReference.set(reference, verificationId)
    this.references.set(verificationId, reference)
    this.results.set(verificationId, { status: "pending" })
    return verificationId
  }
}
