import { anApplication } from "@/tests/fixtures/applications"
import { Money } from "@/src/core/domain/payment/money"
import { HoldExpired } from "@/src/core/errors/payment/hold-expired"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { PaymentProvider } from "./payment-provider"

const TOTAL = Money.ofCents(6999)
const FEE = Money.ofCents(1999)

export interface PaymentProviderSubject {
  provider: PaymentProvider
  customerPays(paymentId: string): Promise<void>
  notificationOfPayment(paymentId: string): Promise<{ payload: string; signature: string }>
}

export function paymentProviderContract(name: string, makeSubject: () => PaymentProviderSubject) {
  describe(`PaymentProvider contract: ${name}`, () => {
    let subject: PaymentProviderSubject
    let provider: PaymentProvider
    beforeEach(() => {
      subject = makeSubject()
      provider = subject.provider
    })

    const newPayment = async () => {
      const { reference, email } = anApplication()
      return provider.createPayment({ reference, service: "deregistration", amount: TOTAL, email })
    }

    const paid = async () => {
      const { paymentId } = await newPayment()
      await subject.customerPays(paymentId)
      return paymentId
    }

    const captured = async () => {
      const paymentId = await paid()
      await provider.capture(paymentId, TOTAL)
      return paymentId
    }

    it("returns the same payment for the same reference, so a retried checkout never charges twice", async () => {
      const { reference, email } = anApplication()

      const first = await provider.createPayment({ reference, service: "deregistration", amount: TOTAL, email })
      const again = await provider.createPayment({ reference, service: "deregistration", amount: TOTAL, email })

      expect(again.paymentId).toBe(first.paymentId)
      expect(first.clientSecret).toEqual(expect.any(String))
    })

    it("waits for the customer until they pay", async () => {
      const { paymentId } = await newPayment()

      expect(await provider.getPayment(paymentId)).toMatchObject({ status: "awaitingCustomer", amount: TOTAL })
    })

    it("holds a card payment until it expires", async () => {
      const payment = await provider.getPayment(await paid())

      expect(payment.status).toBe("held")
      expect(payment.holdExpiresAt).toEqual(expect.any(Date))
    })

    describe("capture", () => {
      it("takes part of a hold and releases the rest", async () => {
        const payment = await provider.capture(await paid(), FEE)

        expect(payment).toMatchObject({ status: "captured", captured: FEE })
      })

      it("happens once: a second capture changes nothing", async () => {
        const paymentId = await paid()
        await provider.capture(paymentId, FEE)

        expect(await provider.capture(paymentId, TOTAL)).toMatchObject({ status: "captured", captured: FEE })
      })

      it("is impossible once the hold is released", async () => {
        const paymentId = await paid()
        await provider.release(paymentId)

        await expect(provider.capture(paymentId, TOTAL)).rejects.toBeInstanceOf(HoldExpired)
      })

      it("never takes more than was held", async () => {
        await expect(provider.capture(await paid(), Money.ofCents(7000))).rejects.toThrow(RangeError)
      })
    })

    it("records the registration service's id on a held payment, and recording it again is harmless", async () => {
      const paymentId = await paid()

      await provider.recordRegistration(paymentId, "registration-1")
      await provider.recordRegistration(paymentId, "registration-1")

      expect(await provider.getPayment(paymentId)).toMatchObject({ status: "held", registrationId: "registration-1" })
    })

    it("releases a hold, and releasing again is harmless", async () => {
      const paymentId = await paid()

      await provider.release(paymentId)

      expect(await provider.release(paymentId)).toMatchObject({ status: "released", captured: Money.ofCents(0) })
    })

    // Stripe shows a cancelled authorisation as a refunded charge; the adapter must not echo that.
    it("never reports more refunded than captured: a released hold returned nothing that was taken", async () => {
      const paymentId = await paid()
      await provider.release(paymentId)

      const { captured, refunded } = await provider.getPayment(paymentId)

      expect(refunded.cents).toBeLessThanOrEqual(captured.cents)
    })

    describe("notifications", () => {
      it("reads a signed notification that a payment is ready, naming the order it belongs to", async () => {
        const { reference, email } = anApplication()
        const { paymentId } = await provider.createPayment({ reference, service: "deregistration", amount: TOTAL, email })
        await subject.customerPays(paymentId)
        const { payload, signature } = await subject.notificationOfPayment(paymentId)

        expect(provider.readNotification(payload, signature)).toMatchObject({ kind: "paymentReady", reference })
      })

      it("rejects a notification whose payload was changed after signing", async () => {
        const paymentId = await paid()
        const { payload, signature } = await subject.notificationOfPayment(paymentId)

        expect(() => provider.readNotification(payload.replace("ZG-", "ZG-X"), signature)).toThrow(NotificationRejected)
      })

      it("rejects an unsigned notification", async () => {
        const { payload } = await subject.notificationOfPayment(await paid())

        expect(() => provider.readNotification(payload, null)).toThrow(NotificationRejected)
      })
    })

    describe("refund", () => {
      it("refunds once per idempotency key, however often it is sent", async () => {
        const paymentId = await captured()
        const remainder = TOTAL.subtract(FEE)

        await provider.refund(paymentId, remainder, "refund-key")
        const again = await provider.refund(paymentId, remainder, "refund-key")

        expect(again.refunded).toEqual(remainder)
      })

      it("never refunds more than was captured and not yet refunded", async () => {
        const paymentId = await captured()
        await provider.refund(paymentId, TOTAL.subtract(FEE), "first")

        await expect(provider.refund(paymentId, Money.ofCents(2000), "second")).rejects.toThrow(RangeError)
      })

      it("needs captured money: a hold is released instead", async () => {
        await expect(provider.refund(await paid(), FEE, "key")).rejects.toThrow(RangeError)
      })
    })
  })
}
