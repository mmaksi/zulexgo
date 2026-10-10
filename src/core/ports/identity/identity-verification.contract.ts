import { Secret } from "@/src/core/domain/secret"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import { anApplication } from "@/tests/fixtures/applications"
import type { IdentityVerification, VerificationResult } from "./identity-verification"

export type Finish = Exclude<VerificationResult, { status: "pending" }>

export const VERIFIED_PERSON = { firstName: "Erika", lastName: "Mustermann", birthDate: new Secret("1990-05-17", "birth date") } as const

export interface IdentityVerificationSubject {
  verification: IdentityVerification
  customerFinishes(verificationId: string, finish: Finish): Promise<void>
  notificationOf(verificationId: string): { payload: string; signature: string }
}

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

      expect(await verification.getResult(verificationId)).toEqual({ status: "pending" })
    })

    it("reports the verified person once the customer is verified, and never changes again", async () => {
      const { verificationId } = await verification.start(anApplication())

      await subject.customerFinishes(verificationId, { status: "verified", person: VERIFIED_PERSON })
      await subject.customerFinishes(verificationId, { status: "failed" })

      const result = await verification.getResult(verificationId)
      expect(result.status).toBe("verified")
      if (result.status !== "verified") return
      expect(result.person.firstName).toBe(VERIFIED_PERSON.firstName)
      expect(result.person.lastName).toBe(VERIFIED_PERSON.lastName)
      expect(result.person.birthDate.reveal()).toBe(VERIFIED_PERSON.birthDate.reveal())
    })

    it("reports a failed verification and never changes again", async () => {
      const { verificationId } = await verification.start(anApplication())

      await subject.customerFinishes(verificationId, { status: "failed" })
      await subject.customerFinishes(verificationId, { status: "verified", person: VERIFIED_PERSON })

      expect(await verification.getResult(verificationId)).toEqual({ status: "failed" })
    })

    describe("a notification from the provider", () => {
      it("names the order it is about, and says nothing of the outcome, which is read with getResult", async () => {
        const { reference, email } = anApplication()
        const { verificationId } = await verification.start({ reference, email })
        await subject.customerFinishes(verificationId, { status: "failed" })
        const { payload, signature } = subject.notificationOf(verificationId)

        expect(verification.readNotification(payload, signature)).toEqual({ kind: "verificationChanged", reference })
      })

      it("is read the same when it arrives twice", async () => {
        const { verificationId } = await verification.start(anApplication())
        const { payload, signature } = subject.notificationOf(verificationId)

        expect(verification.readNotification(payload, signature)).toEqual(verification.readNotification(payload, signature))
      })

      it("is refused when it carries no signature, the wrong one, or a body that was altered after it was signed", async () => {
        const { verificationId } = await verification.start(anApplication())
        const { payload, signature } = subject.notificationOf(verificationId)

        expect(() => verification.readNotification(payload, null)).toThrow(NotificationRejected)
        expect(() => verification.readNotification(payload, `${signature}0`)).toThrow(NotificationRejected)
        expect(() => verification.readNotification(payload.replace("ZG-", "ZG-X"), signature)).toThrow(NotificationRejected)
      })
    })
  })
}
