import { anApplication } from "@/tests/fixtures/applications"
import type { IdentityVerification } from "./identity-verification"

/** What the customer does at the provider, which the server cannot: the adapter's test supplies it. */
export interface IdentityVerificationSubject {
  verification: IdentityVerification
  customerFinishes(verificationId: string, outcome: "verified" | "failed"): Promise<void>
}

/** Every IdentityVerification adapter must pass this, including the fake. */
export function identityVerificationContract(name: string, makeSubject: () => IdentityVerificationSubject) {
  describe(`IdentityVerification contract: ${name}`, () => {
    let subject: IdentityVerificationSubject
    let verification: IdentityVerification
    beforeEach(() => {
      subject = makeSubject()
      verification = subject.verification
    })

    it("starts one verification per application, so a retried step never sends a second link", async () => {
      const { reference, email } = anApplication()

      const first = await verification.start({ reference, email })
      const again = await verification.start({ reference, email })
      const other = await verification.start(anApplication())

      expect(again).toEqual(first)
      expect(other.verificationId).not.toBe(first.verificationId)
      expect(first.link).toMatch(/^https:\/\//)
    })

    it("stays pending until the customer finishes", async () => {
      const { verificationId } = await verification.start(anApplication())

      expect(await verification.getResult(verificationId)).toBe("pending")
    })

    it.each(["verified", "failed"] as const)("reports %s once the customer finishes, and never changes again", async (outcome) => {
      const { verificationId } = await verification.start(anApplication())

      await subject.customerFinishes(verificationId, outcome)
      await subject.customerFinishes(verificationId, outcome === "verified" ? "failed" : "verified")

      expect(await verification.getResult(verificationId)).toBe(outcome)
    })
  })
}
