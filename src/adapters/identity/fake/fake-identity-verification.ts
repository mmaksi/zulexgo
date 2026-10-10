import { createHmac, timingSafeEqual } from "node:crypto"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { IdentityNotification, IdentityVerification, VerificationResult } from "@/src/core/ports/identity/identity-verification"

const SIGNING_SECRET = "fake-identity-notification-secret"

const sign = (payload: string) => createHmac("sha256", SIGNING_SECRET).update(payload).digest("hex")

export class FakeIdentityVerification implements IdentityVerification {
  private readonly byReference = new Map<ApplicationReference, string>()
  private readonly references = new Map<string, ApplicationReference>()
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

  readNotification(payload: string, signature: string | null): IdentityNotification {
    const expected = Buffer.from(sign(payload))
    const given = Buffer.from(signature ?? "")
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new NotificationRejected()

    const { type, reference } = JSON.parse(payload)
    return type === "verificationChanged" ? { kind: "verificationChanged", reference } : { kind: "ignored" }
  }

  async customerFinishes(verificationId: string, finish: Exclude<VerificationResult, { status: "pending" }>): Promise<void> {
    if (this.results.get(verificationId)?.status === "pending") this.results.set(verificationId, finish)
  }

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
