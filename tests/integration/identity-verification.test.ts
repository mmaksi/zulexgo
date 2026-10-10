import { handleIdentityNotification } from "@/app/api/webhooks/identity/handle"
import { aNewRegistrationApplication } from "@/tests/fixtures/applications"
import { Secret } from "@/src/core/domain/secret"
import { PROCESSING_FEE, SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { StaleApplication } from "@/src/core/errors/application/stale-application"
import type { EmailTemplate } from "@/src/core/ports/mail/mailer"
import { applyEvent } from "@/src/core/domain/application/application"
import { checkIdentityVerification } from "@/src/core/use-cases/identity/check-identity-verification"
import { startIdentityVerification } from "@/src/core/use-cases/identity/start-identity-verification"
import { DAY, HOUR, MINUTE, setupFlow } from "./flow-harness"

const FINISHED = { state: "finished", documents: [] } as const
const STAGING = { APP_ENV: "staging", IDENTITY_DRIVER: "fake" } as const

type Flow = ReturnType<typeof setupFlow>

const sent = <Name extends EmailTemplate["name"]>(flow: Flow, name: Name) =>
  flow.deps.mailer.sent.map(({ template }) => template).filter((template): template is Extract<EmailTemplate, { name: Name }> => template.name === name)

// Provisional: launch plan Q45; a Neuzulassung is filed only after identity verification (status 3).
describe("identity verification: a paid Neuzulassung waits for the customer's verified identity before anything is filed", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  describe("paying", () => {
    it("starts the verification instead of filing: status 2, email 1 and then email 2, the card still held, nothing at Zulex", async () => {
      const flow = setupFlow()

      const reference = await flow.checkoutAndPayNewRegistration()

      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested"])
      expect(flow.deps.registration.submissions).toEqual([])
      expect(await flow.payment(reference)).toMatchObject({ status: "held" })
    })

    it("tells the customer where to verify and until when, the deadline being the one it enforces", async () => {
      const flow = setupFlow()
      const startedAt = flow.clock.now()

      const reference = await flow.checkoutAndPayNewRegistration()

      const [email] = sent(flow, "identityVerificationRequested")
      expect(email.verificationLink).toMatch(/^https:\/\//)
      expect(email.deadline).toEqual(new Date(startedAt.getTime() + 4 * DAY))
      expect((await flow.stored(reference)).identityVerification?.deadline).toEqual(email.deadline)
    })

    // Resend answers 409 to a held key with other content, so the retry must repeat the first deadline.
    it("repeats email 2 word for word when the order could not be saved after it went out, so the mailer accepts the retry", async () => {
      const flow = setupFlow()
      const update = flow.deps.repository.update.bind(flow.deps.repository)
      jest.spyOn(flow.deps.repository, "update").mockImplementation(async (application) => {
        if (application.status === "awaiting_identity_verification") throw new Error("the database blinked")
        return update(application)
      })
      const reference = await flow.payForNewRegistration()
      await expect(flow.confirm(reference)).rejects.toThrow("the database blinked")
      const [first] = sent(flow, "identityVerificationRequested")
      jest.restoreAllMocks()
      jest.spyOn(console, "warn").mockImplementation(() => {})

      await flow.poll(2)

      const order = await flow.stored(reference)
      expect(order.status).toBe("awaiting_identity_verification")
      expect(sent(flow, "identityVerificationRequested")).toEqual([first])
      expect(order.identityVerification?.deadline).toEqual(first.deadline)
    })

    it("sends email 2 once when two ticks start the same order together, however far apart their clocks read", async () => {
      const flow = setupFlow()
      const reference = await flow.payForNewRegistration()
      const paid = await flow.deps.repository.update({
        ...applyEvent(await flow.stored(reference), "paymentConfirmed", flow.clock.now()),
        polling: { attempts: 0, nextPollAt: flow.clock.now() },
      })
      await flow.deps.repository.setStatusToken(reference, flow.deps.tokens.generate())
      const send = flow.deps.mailer.send.bind(flow.deps.mailer)
      jest.spyOn(flow.deps.mailer, "send").mockImplementationOnce(async (message) => {
        flow.clock.advance(MINUTE)
        return send(message)
      })

      const results = await Promise.allSettled([startIdentityVerification(flow.deps, paid), startIdentityVerification(flow.deps, paid)])

      expect(results.filter(({ status }) => status === "rejected").map((result) => (result as PromiseRejectedResult).reason)).toEqual([expect.any(StaleApplication)])
      expect(sent(flow, "identityVerificationRequested")).toHaveLength(1)
      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
    })

    it("does not send email 2 twice when the payment notification is delivered twice", async () => {
      const flow = setupFlow()
      const reference = await flow.payForNewRegistration()

      await flow.confirm(reference)
      await flow.confirm(reference)

      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested"])
    })

    it("leaves a de-registration alone: it is filed at once, never asked to verify", async () => {
      const flow = setupFlow()

      const reference = await flow.checkoutAndPay()

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba"])
    })
  })

  describe("while the customer has not finished", () => {
    it("changes nothing and sends nothing, however often the poller looks, and files nothing", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      const before = await flow.stored(reference)

      for (let visit = 0; visit < 5; visit++) await flow.poll(60)

      const after = await flow.stored(reference)
      expect(after.status).toBe("awaiting_identity_verification")
      expect(after.history).toEqual(before.history)
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested"])
      expect(flow.deps.registration.submissions).toEqual([])
    })

    it("looks again within a minute at first, since the customer is probably verifying right now", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()

      const { nextPollAt } = (await flow.stored(reference)).polling

      expect(nextPollAt!.getTime() - flow.clock.now().getTime()).toBe(MINUTE)
    })
  })

  describe("verified", () => {
    it("runs 1 → 2 → 3 → 4 → 5a, with exactly one email per transition and nothing filed before status 3", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.poll(5)
      expect(flow.deps.registration.submissions).toEqual([])

      await flow.customerVerifies(reference)
      await flow.poll(5)
      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(flow.deps.registration.submissions).toHaveLength(1)

      flow.deps.registration.setStatus(await flow.zulexId(reference), FINISHED)
      await flow.poll(10)
      await flow.poll(30)

      const order = await flow.stored(reference)
      expect(order.status).toBe("completed")
      expect(order.history.map(({ status }) => status)).toEqual([
        "awaiting_payment",
        "submitted_and_paid",
        "awaiting_identity_verification",
        "identity_verified",
        "submitted_to_kba",
        "completed",
      ])
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested", "identityVerified", "submittedToKba", "completed"])
    })

    it("files it the moment the poller reads the result, without waiting for another tick", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)

      await flow.poll(1)

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(flow.emails()).toContain("identityVerified")
    })

    it("picks the filing up on the next tick when it dies after status 3, and sends no second email 3", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)
      flow.deps.registration.failNext("submit", new Error("the service is down"))

      await flow.poll(1)
      expect((await flow.stored(reference)).status).toBe("identity_verified")
      expect(flow.deps.registration.submissions).toEqual([])

      await flow.poll(5)

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(sent(flow, "identityVerified")).toHaveLength(1)
    })

    it("is read by the poller as often as it is looked at, and the same result never files twice", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)
      await flow.poll(1)

      await flow.poll(30)
      await flow.poll(30)

      expect(flow.deps.registration.submissions).toHaveLength(1)
    })

    it("keeps the order at status 2 for the next tick when email 3 cannot be sent, and sends it then", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)
      const send = flow.deps.mailer.send.bind(flow.deps.mailer)
      let failed = false
      jest.spyOn(flow.deps.mailer, "send").mockImplementation(async (message) => {
        if (message.template.name === "identityVerified" && !failed) {
          failed = true
          throw new Error("Resend refused the message")
        }
        return send(message)
      })

      await flow.poll(1)
      const waiting = await flow.stored(reference)
      expect(waiting.status).toBe("awaiting_identity_verification")
      expect(flow.deps.registration.submissions).toEqual([])
      expect(waiting.polling.nextPollAt!.getTime()).toBeGreaterThan(flow.clock.now().getTime())

      await flow.poll(5)

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested", "identityVerified", "submittedToKba"])
    })
  })

  describe("the person who verified is not the owner on the order (launch plan Q47, provisional)", () => {
    const another = { firstName: "Erik", lastName: "Mustermann", birthDate: new Secret("1990-05-17", "birth date") }

    it("goes to 5b with email 5b and nothing filed, the money untouched, so the customer can correct the name and birth date", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference, another)

      await flow.poll(1)

      const order = await flow.stored(reference)
      expect(order.status).toBe("failed_correctable")
      expect(order.failure).toEqual({ kind: "identityMismatch" })
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested", "correctionRequired"])
      expect(flow.deps.registration.submissions).toEqual([])
      expect(await flow.payment(reference)).toMatchObject({ status: "held" })
    })

    it("tells the customer what to check in words that carry neither name nor birth date", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference, another)

      await flow.poll(1)

      const [email] = sent(flow, "correctionRequired")
      expect(email).toMatchObject({ service: "newRegistration", identityMismatch: true })
      expect(email.reason).toMatch(/Name und Geburtsdatum/)
      expect(JSON.stringify(email)).not.toMatch(/Erik|Mustermann|1990/)
    })

    it("keeps looking at the card hold daily, as for any order that waits for the customer", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference, another)
      await flow.poll(1)

      const { nextPollAt } = (await flow.stored(reference)).polling

      expect(nextPollAt!.getTime() - flow.clock.now().getTime()).toBe(24 * HOUR)
    })
  })

  describe("the provider could not verify the customer (business logic §2)", () => {
    it("ends at 5c: the fee kept, the rest back, email 5c and then email 6, and nothing was ever filed", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerFailsVerification(reference)

      await flow.poll(1)

      const order = await flow.stored(reference)
      expect(order.status).toBe("failed_final")
      expect(order.failure).toEqual({ kind: "identityFailed" })
      expect(order.history.map(({ status }) => status)).not.toContain("identity_verified")
      expect(flow.deps.registration.submissions).toEqual([])
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested", "rejected", "refundIssued"])

      const returned = SERVICE_PRICES.newRegistration.subtract(PROCESSING_FEE)
      const [rejected] = sent(flow, "rejected")
      expect(rejected).toMatchObject({ refund: returned, retained: PROCESSING_FEE })
      expect(sent(flow, "refundIssued")[0].amount).toEqual(returned)
      expect(await flow.payment(reference)).toMatchObject({ status: "captured", captured: PROCESSING_FEE })
    })
  })

  describe("the customer does not verify in time (launch plan Q48, provisional: reminder after 2 days, deadline after 4)", () => {
    it("reminds once, when the reminder is due, with the same link and deadline as email 2, and remembers that it did", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      const send = jest.spyOn(flow.deps.mailer, "send")
      const reminders = () => send.mock.calls.filter(([{ template }]) => template.name === "identityVerificationReminder")

      await flow.poll(2 * 24 * 60 - 1)
      expect(reminders()).toHaveLength(0)
      await flow.poll(1)
      await flow.poll(60)
      await flow.poll(60)

      // The mailer's own idempotency key only covers a day, so the reminder is attempted once, not per visit.
      expect(reminders()).toHaveLength(1)
      const [requested] = sent(flow, "identityVerificationRequested")
      expect(sent(flow, "identityVerificationReminder")).toEqual([
        { name: "identityVerificationReminder", reference, verificationLink: requested.verificationLink, deadline: requested.deadline },
      ])
      expect((await flow.stored(reference)).identityVerification?.reminderSent).toBe(true)
      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
    })

    it("cancels at the deadline, not up to an hour after it, and releases the hold in full since nothing was filed", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      const { deadline } = (await flow.stored(reference)).identityVerification!

      for (let visits = 0; flow.clock.now() < deadline; visits++) {
        expect(visits).toBeLessThan(200)
        expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
        const next = (await flow.stored(reference)).polling.nextPollAt!
        expect(next.getTime()).toBeGreaterThan(flow.clock.now().getTime())
        flow.clock.set(next)
        await flow.poll(0)
      }

      const order = await flow.stored(reference)
      expect(flow.clock.now()).toEqual(deadline)
      expect(order.status).toBe("cancelled")
      expect(await flow.payment(reference)).toMatchObject({ status: "released" })
      expect(flow.deps.registration.submissions).toEqual([])
    })

    it("sends email 6 for the whole price and nothing else, not even the reminder that fell due on the same visit", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()

      await flow.poll(4 * 24 * 60)
      await flow.poll(60)

      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested", "refundIssued"])
      expect(sent(flow, "refundIssued")[0].amount).toEqual(SERVICE_PRICES.newRegistration)
      expect((await flow.stored(reference)).polling.nextPollAt).toBeUndefined()
    })

    it("finds the deadline before the card hold's guard, so a poller that was down for days releases the hold instead of capturing it", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()

      // Past the deadline (day 4) and inside the guard's capture margin (the hold lapses at 7, margin 2).
      await flow.poll(5.5 * 24 * 60)

      expect((await flow.stored(reference)).status).toBe("cancelled")
      expect(await flow.payment(reference)).toMatchObject({ status: "released" })
    })

    it("never refunds an order that was verified and filed while the same tick was deciding to cancel it", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      flow.clock.advance(4 * DAY)
      const readBeforeTheCallback = await flow.stored(reference)
      jest.spyOn(flow.deps.identity, "getResult").mockImplementationOnce(async () => {
        await flow.customerVerifies(reference)
        await checkIdentityVerification(flow.deps, readBeforeTheCallback)
        return { status: "pending" }
      })

      await expect(checkIdentityVerification(flow.deps, readBeforeTheCallback)).rejects.toThrow(StaleApplication)

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(flow.deps.registration.submissions).toHaveLength(1)
      expect(await flow.payment(reference)).toMatchObject({ refunded: { cents: 0 } })
      expect(await flow.payment(reference)).not.toMatchObject({ status: "released" })
      expect(flow.emails()).not.toContain("refundIssued")
    })

    it("never files an order that a tick cancelled while its verification was being accepted", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      flow.clock.advance(4 * DAY)
      const readByBoth = await flow.stored(reference)
      await flow.customerVerifies(reference)
      const send = flow.deps.mailer.send.bind(flow.deps.mailer)
      let cancelledMeanwhile = false
      jest.spyOn(flow.deps.mailer, "send").mockImplementation(async (message) => {
        if (message.template.name === "identityVerified" && !cancelledMeanwhile) {
          cancelledMeanwhile = true
          jest.spyOn(flow.deps.identity, "getResult").mockResolvedValueOnce({ status: "pending" })
          await checkIdentityVerification(flow.deps, readByBoth)
        }
        return send(message)
      })

      await expect(checkIdentityVerification(flow.deps, readByBoth)).rejects.toThrow(StaleApplication)

      expect((await flow.stored(reference)).status).toBe("cancelled")
      expect(flow.deps.registration.submissions).toEqual([])
      expect(await flow.payment(reference)).toMatchObject({ status: "released" })
    })

    it("accepts a customer who verified before the deadline but was read after it", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)

      await flow.poll(4 * 24 * 60 + 30)

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
    })
  })

  describe("the identity provider cannot be reached", () => {
    it("retries starting the verification, and tells the customer nothing until it works", async () => {
      const flow = setupFlow()
      jest.spyOn(flow.deps.identity, "start").mockRejectedValueOnce(new Error("Verimi is down"))

      const reference = await flow.checkoutAndPayNewRegistration()
      expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
      expect(flow.emails()).toEqual(["orderConfirmation"])

      await flow.poll(2)

      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested"])
      expect(flow.deps.registration.submissions).toEqual([])
    })

    it("gives up after a day with everything back, as for a filing that never gets through: our fault, not the customer's", async () => {
      const flow = setupFlow()
      jest.spyOn(flow.deps.identity, "start").mockRejectedValue(new Error("Verimi is down"))
      const reference = await flow.checkoutAndPayNewRegistration()

      for (let hour = 0; hour < 26; hour++) await flow.poll(60)

      expect((await flow.stored(reference)).status).toBe("failed_final")
      expect(await flow.payment(reference)).toMatchObject({ status: "released" })
      expect(flow.emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])
      expect(sent(flow, "rejected")[0].retained.cents).toBe(0)
    })

    it("keeps the order at status 1 when email 2 cannot be sent, backs off, and sends it once with the same link when it can", async () => {
      const flow = setupFlow()
      const send = flow.deps.mailer.send.bind(flow.deps.mailer)
      let failed = false
      jest.spyOn(flow.deps.mailer, "send").mockImplementation(async (message) => {
        if (message.template.name === "identityVerificationRequested" && !failed) {
          failed = true
          throw new Error("Resend refused the message")
        }
        return send(message)
      })

      const reference = await flow.payForNewRegistration()
      await expect(flow.confirm(reference)).rejects.toThrow("Resend refused the message")
      const paid = await flow.stored(reference)
      expect(paid.status).toBe("submitted_and_paid")
      expect(paid.identityVerification).toBeUndefined()

      await flow.poll(2)

      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
      expect(sent(flow, "identityVerificationRequested")).toHaveLength(1)
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested"])
    })

    it("backs off when the money cannot be returned at the deadline, and finishes it on a later tick with one email 6", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      jest.spyOn(flow.deps.payments, "release").mockRejectedValueOnce(new Error("Stripe is down"))

      await flow.poll(4 * 24 * 60)
      const stuck = await flow.stored(reference)
      expect(stuck.status).toBe("awaiting_identity_verification")
      expect(stuck.polling.nextPollAt!.getTime()).toBeGreaterThan(flow.clock.now().getTime())
      expect(flow.emails()).not.toContain("refundIssued")

      await flow.poll(5)

      expect((await flow.stored(reference)).status).toBe("cancelled")
      expect(await flow.payment(reference)).toMatchObject({ status: "released" })
      expect(sent(flow, "refundIssued")).toHaveLength(1)
    })

    it("keeps the order at status 2 and asks again later when the result cannot be read", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)
      jest.spyOn(flow.deps.identity, "getResult").mockRejectedValueOnce(new Error("Verimi is down"))

      await flow.poll(1)
      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")

      await flow.poll(5)

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
    })
  })

  describe("a callback from the provider", () => {
    const callback = (payload: string, signature?: string) =>
      new Request("https://zulexgo.example.test/api/webhooks/identity", {
        method: "POST",
        body: payload,
        headers: signature ? { "x-identity-signature": signature } : {},
      })

    it("is refused with a 400 when it is unsigned, wrongly signed or altered, and changes nothing", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)
      const { payload, signature } = flow.deps.identity.notificationOf(await flow.verificationId(reference))

      const responses = await Promise.all([
        handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload)),
        handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, `${signature}0`)),
        handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload.replace("ZG-", "ZG-X"), signature)),
      ])

      expect(responses.map(({ status }) => status)).toEqual([400, 400, 400])
      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
      expect(flow.deps.registration.submissions).toEqual([])
    })

    it("answers 404 in production while the identity check is the fake, whose signing secret is in the public repo, and checks nothing", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)
      const { payload, signature } = flow.deps.identity.notificationOf(await flow.verificationId(reference))

      const response = await handleIdentityNotification({ ...flow.deps, env: { APP_ENV: "production", IDENTITY_DRIVER: "fake" } }, callback(payload, signature))

      expect(response.status).toBe(404)
      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
    })

    it("runs the same check the poller does, for the order it names, so the order is filed without waiting for a tick", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)
      const { payload, signature } = flow.deps.identity.notificationOf(await flow.verificationId(reference))

      const response = await handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, signature))

      expect(response.status).toBe(200)
      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
    })

    it("is safe to receive twice, and files and mails once", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerVerifies(reference)
      const { payload, signature } = flow.deps.identity.notificationOf(await flow.verificationId(reference))

      await handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, signature))
      const again = await handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, signature))

      expect(again.status).toBe(200)
      expect(sent(flow, "identityVerified")).toHaveLength(1)
      expect(flow.deps.registration.submissions).toHaveLength(1)
    })

    it("asks the provider for the outcome and trusts nothing in the callback: one that arrives early changes nothing", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      const { payload, signature } = flow.deps.identity.notificationOf(await flow.verificationId(reference))

      const response = await handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, signature))

      expect(response.status).toBe(200)
      expect((await flow.stored(reference)).status).toBe("awaiting_identity_verification")
      expect(flow.emails()).toEqual(["orderConfirmation", "identityVerificationRequested"])
    })

    it("answers 200 for an order nobody holds, which tells a caller nothing about which references exist", async () => {
      const flow = setupFlow()
      const { reference, email } = aNewRegistrationApplication()
      const { verificationId } = await flow.deps.identity.start({ reference, email })
      const { payload, signature } = flow.deps.identity.notificationOf(verificationId)

      expect((await handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, signature))).status).toBe(200)
    })

    it("answers 500 when the check fails, so the provider tries again, and logs the order and the kind of error, never the message", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      const { payload, signature } = flow.deps.identity.notificationOf(await flow.verificationId(reference))
      jest.spyOn(flow.deps.identity, "getResult").mockRejectedValueOnce(new Error("Verimi could not read the document of erika.mustermann@example.test"))
      const logged = jest.spyOn(console, "error")

      const response = await handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, signature))

      expect(response.status).toBe(500)
      const output = logged.mock.calls.flat().join("\n")
      expect(output).toContain(reference)
      expect(output).toContain("Error")
      expect(output).not.toContain("erika.mustermann")
    })

    it("answers 500 when the order cannot be read, and logs the order and the kind of error, never the message", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      const { payload, signature } = flow.deps.identity.notificationOf(await flow.verificationId(reference))
      jest.spyOn(flow.deps.repository, "get").mockRejectedValueOnce(new Error("row erika.mustermann@example.test could not be read"))
      const logged = jest.spyOn(console, "error").mockImplementation(() => {})

      const response = await handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, signature))

      expect(response.status).toBe(500)
      const output = logged.mock.calls.flat().join("\n")
      expect(output).toContain(reference)
      expect(output).not.toContain("erika.mustermann")
    })

    it("leaves an order that is not waiting for it alone", async () => {
      const flow = setupFlow()
      const reference = await flow.checkoutAndPayNewRegistration()
      await flow.customerFailsVerification(reference)
      await flow.poll(1)
      const done = await flow.stored(reference)
      const { payload, signature } = flow.deps.identity.notificationOf(await flow.verificationId(reference))

      await handleIdentityNotification({ ...flow.deps, env: STAGING }, callback(payload, signature))

      expect(await flow.stored(reference)).toEqual(done)
    })
  })
})
