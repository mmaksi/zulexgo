import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { Money } from "@/src/core/domain/payment/money"
import { PROCESSING_FEE, SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"
import { OpenApplicationExists } from "@/src/core/errors/application/open-application-exists"
import { confirmRefund } from "@/src/core/use-cases/payment/confirm-refund"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { CODES, keepServiceDown, MINUTE, setupFlow as setup } from "./flow-harness"

describe("de-registration flow on fakes", () => {
  describe("J1, happy path", () => {
    it("goes from checkout to completed, one email per step, capturing the held card in full", async () => {
      const { deps, emails, stored, zulexId, payment, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay("card")

      expect((await stored(reference)).status).toBe("submitted_to_kba")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])

      await poll(1)
      expect((await stored(reference)).status).toBe("submitted_to_kba")

      deps.registration.setDocument("77", new TextEncoder().encode("%PDF-confirmation"))
      deps.registration.setStatus(await zulexId(reference), {
        state: "finished",
        documents: [{ id: "77", kind: "confirmation" }],
      })
      await poll(2)

      expect((await stored(reference)).status).toBe("completed")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba", "completed"])
      expect(await payment(reference)).toMatchObject({ status: "captured", captured: SERVICE_PRICES.deregistration })
      expect(await deps.documents.list(reference)).toEqual([{ id: "77", kind: "confirmation" }])
    })

    it("leaves a SEPA payment as it is on completion, since it was taken at checkout", async () => {
      const { deps, zulexId, payment, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay("sepaDebit")

      deps.registration.setStatus(await zulexId(reference), { state: "finished", documents: [] })
      await poll(1)

      expect(await payment(reference)).toMatchObject({ status: "captured", captured: SERVICE_PRICES.deregistration })
    })

    it("sends the same status link in every email", async () => {
      const { deps, zulexId, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()
      deps.registration.setStatus(await zulexId(reference), { state: "finished", documents: [] })
      await poll(1)

      const links = new Set(deps.mailer.sent.map(({ template }) => ("statusLink" in template ? template.statusLink : "")))

      expect([...links]).toEqual([expect.stringMatching(/^https:\/\/zulexgo\.example\.test\/status\/faketoken-/)])
    })
  })

  describe("payment confirmation", () => {
    it("ignores a replayed confirmation: one email, one submission", async () => {
      const { deps, emails, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()

      await confirmPayment(deps, reference)

      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
      expect(deps.registration.submissions).toHaveLength(1)
    })

    it("resumes on the provider's retry when email 1 failed, keeping the status link it already issued", async () => {
      const { deps, emails, stored } = setup()
      const { reference } = await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test" })
      await deps.payments.customerPays((await stored(reference)).payment.id, "card")
      jest.spyOn(deps.mailer, "send").mockRejectedValueOnce(new Error("Resend refused the message"))

      await expect(confirmPayment(deps, reference)).rejects.toThrow("Resend refused the message")
      const issued = await deps.repository.getStatusToken(reference)
      await confirmPayment(deps, reference)

      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
      expect((await stored(reference)).status).toBe("submitted_to_kba")
      expect(await deps.repository.getStatusToken(reference)).toBe(issued)
      expect(deps.mailer.sent[0].template).toMatchObject({ statusLink: expect.stringMatching(new RegExp(`/${issued}$`)) })
    })

    it("leaves a submission that died after payment was recorded for the poller to resume", async () => {
      const { deps, emails, stored, poll } = setup()
      const { reference } = await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test" })
      await deps.payments.customerPays((await stored(reference)).payment.id, "card")
      deps.registration.failNext("submit", new Error("the process died"))

      await expect(confirmPayment(deps, reference)).rejects.toThrow("the process died")
      await poll(1)

      expect((await stored(reference)).status).toBe("submitted_to_kba")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
    })

    it("does nothing until the customer has actually paid", async () => {
      const { deps, emails, stored } = setup()
      const { reference } = await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test" })

      await confirmPayment(deps, reference)

      expect((await stored(reference)).status).toBe("awaiting_payment")
      expect(emails()).toEqual([])
    })
  })

  describe("J8, a second order for a vehicle that already has one open", () => {
    const again = (flow: ReturnType<typeof setup>, options: { acknowledgedDuplicate?: boolean; vin?: string } = {}) =>
      submitCheckout(flow.deps, {
        service: "deregistration",
        request: { ...FAKE_REQUEST, vin: options.vin ?? FAKE_REQUEST.vin },
        email: "customer@example.test",
        acknowledgedDuplicate: options.acknowledgedDuplicate,
      })

    it("warns instead of opening a second payment for the same plate and VIN while the first is with the KBA", async () => {
      const flow = setup()
      await flow.checkoutAndPay()
      const createPayment = jest.spyOn(flow.deps.payments, "createPayment")

      await expect(again(flow)).rejects.toBeInstanceOf(OpenApplicationExists)

      expect(createPayment).not.toHaveBeenCalled()
    })

    it("goes ahead once the customer has confirmed that they mean it", async () => {
      const flow = setup()
      const first = await flow.checkoutAndPay()

      const second = await again(flow, { acknowledgedDuplicate: true })

      expect(second.reference).not.toBe(first)
    })

    it("does not warn for another vehicle, or for an earlier checkout that was never paid", async () => {
      const flow = setup()
      await flow.payForCheckout()

      await expect(again(flow)).resolves.toMatchObject({ reference: expect.any(String) })
      await flow.checkoutAndPay()
      await expect(again(flow, { vin: "FAKEVIN0000000002" })).resolves.toMatchObject({ reference: expect.any(String) })
    })

    it("does not warn once the earlier order is over", async () => {
      const flow = setup()
      const first = await flow.checkoutAndPay()
      flow.deps.registration.setStatus(await flow.zulexId(first), { state: "finished", documents: [] })
      await flow.poll(1)

      await expect(again(flow)).resolves.toMatchObject({ reference: expect.any(String) })
    })
  })

  describe("J6, technical errors: one silent retry before the customer hears anything", () => {
    it("resubmits once after the service was unreachable, without an email", async () => {
      const { deps, emails, stored, poll, checkoutAndPay } = setup()
      deps.registration.failNext("submit", new GatewayUnavailable())
      const reference = await checkoutAndPay()

      expect((await stored(reference)).status).toBe("submitted_and_paid")
      expect(emails()).toEqual(["orderConfirmation"])

      await poll(1)

      expect((await stored(reference)).status).toBe("submitted_to_kba")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
    })

    it("keeps resubmitting under the same idempotency key while the service cannot be reached, telling nobody and refunding nothing (D6)", async () => {
      const flow = setup()
      const submit = jest.spyOn(flow.deps.registration, "submit")
      flow.deps.registration.failNext("submit", new GatewayUnavailable())
      const reference = await flow.checkoutAndPay("card")

      await keepServiceDown(flow, 5)

      expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
      expect(flow.emails()).toEqual(["orderConfirmation"])
      expect((await flow.payment(reference)).status).toBe("held")
      expect(submit.mock.calls.length).toBeGreaterThan(2)
      expect(new Set(submit.mock.calls.map(([, key]) => key)).size).toBe(1)
    })

    it.each([
      ["taking the money", (flow: ReturnType<typeof setup>) => jest.spyOn(flow.deps.payments, "capture").mockRejectedValueOnce(new Error("Stripe is down"))],
      ["sending email 4", (flow: ReturnType<typeof setup>) => jest.spyOn(flow.deps.mailer, "send").mockImplementation(async ({ template }) => {
        if (template.name === "submittedToKba") throw new Error("Resend is down")
      })],
    ])("backs off when %s fails after the application was filed, instead of retrying it every tick (D4's twin)", async (_, breakIt) => {
      const error = jest.spyOn(console, "error").mockImplementation(() => {})
      const flow = setup()
      const reference = await flow.payForCheckout("card")
      const broken = breakIt(flow)

      await expect(flow.confirm(reference)).rejects.toThrow()

      expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })
      expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
      broken.mockRestore()

      await flow.poll(1)

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(flow.deps.registration.submissions).toHaveLength(1)
      error.mockRestore()
    })

    it("does not take a 400 on a retry as proof that nothing was filed: the first attempt may have been accepted, so it never becomes a correction that files a second application", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
      const flow = setup()
      flow.deps.registration.failNext("submit", new GatewayUnavailable())
      const reference = await flow.checkoutAndPay("card")

      flow.deps.registration.failNext("submit", new GatewayRejected())
      await flow.poll(2)

      expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
      expect(flow.emails()).toEqual(["orderConfirmation"])
      expect((await flow.stored(reference)).failure).toBeUndefined()

      await keepServiceDown(flow, 24)
      expect((await flow.stored(reference)).status).toBe("failed_final")
      expect(warn.mock.calls.flat().join(" ")).toContain(reference)
      warn.mockRestore()
    })

    it("still sends data refused at the first attempt straight to a correction", async () => {
      const flow = setup()
      flow.deps.registration.failNext("submit", new GatewayRejected())

      const reference = await flow.checkoutAndPay("card")

      expect((await flow.stored(reference)).status).toBe("failed_correctable")
    })

    it("then files the application when the service comes back, however late within the day", async () => {
      const flow = setup()
      flow.deps.registration.failNext("submit", new GatewayUnavailable())
      const reference = await flow.checkoutAndPay("card")
      await keepServiceDown(flow, 20)

      await flow.poll(60)

      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
      expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba"])
    })

    it("fails for good with a full refund only once a day has passed without an answer, and flags the order for support", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
      const flow = setup()
      flow.deps.registration.failNext("submit", new GatewayUnavailable())
      const reference = await flow.checkoutAndPay("card")

      await keepServiceDown(flow, 23)
      expect((await flow.stored(reference)).status).toBe("submitted_and_paid")

      await keepServiceDown(flow, 1)

      expect((await flow.stored(reference)).status).toBe("failed_final")
      expect(await flow.payment(reference)).toMatchObject({ status: "released", captured: Money.ofCents(0) })
      expect(flow.emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])
      expect(warn.mock.calls.flat().join(" ")).toContain(reference)
      await confirmRefund(flow.deps, reference)
      expect(flow.emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])
      expect(flow.deps.mailer.sent.at(-1)?.template).toMatchObject({ amount: SERVICE_PRICES.deregistration })
      warn.mockRestore()
    })

    it("backs off from a submission the service refuses for good, like a wrong API key, instead of retrying every tick (D4)", async () => {
      const error = jest.spyOn(console, "error").mockImplementation(() => {})
      const flow = setup()
      const refused = new Error("Zulex POST /deregistration-applications answered 401")
      refused.name = "ZulexRequestFailed"
      const reference = await flow.payForCheckout("card")
      flow.deps.registration.failNext("submit", refused)
      await expect(flow.confirm(reference)).rejects.toThrow("answered 401")

      expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })

      flow.deps.registration.failNext("submit", refused)
      expect(await flow.poll(1)).toEqual({ checked: 1, failed: 1 })
      expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })
      expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
      expect(flow.emails()).toEqual(["orderConfirmation"])
      error.mockRestore()
    })

    it("gives each submission its own retry: a resubmitted application still gets one for a later KBA error", async () => {
      const { deps, emails, zulexId, poll, checkoutAndPay } = setup()
      deps.registration.failNext("submit", new GatewayUnavailable())
      const reference = await checkoutAndPay()
      await poll(1)

      deps.registration.setStatus(await zulexId(reference), { state: "failed", error: { code: 999, details: [] }, documents: [] })
      await poll(1)

      expect(deps.registration.retries).toEqual([await zulexId(reference)])
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
    })

    it("asks the service to retry a KBA error once, silently, then makes it correctable", async () => {
      const { deps, emails, stored, zulexId, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()
      const id = await zulexId(reference)

      deps.registration.setStatus(id, { state: "failed", error: { code: 999, details: [] }, documents: [] })
      await poll(1)

      expect(deps.registration.retries).toEqual([id])
      expect((await stored(reference)).status).toBe("submitted_to_kba")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])

      deps.registration.setStatus(id, { state: "failed", error: { code: 999, details: [] }, documents: [] })
      await poll(2)

      expect((await stored(reference)).status).toBe("failed_correctable")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba", "correctionRequired"])
    })

    it("flags for support, once, a KBA error code the catalogue does not know, naming the order and never a security code", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
      const { deps, zulexId, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()
      const id = await zulexId(reference)

      deps.registration.setStatus(id, { state: "failed", error: { code: 999, details: [] }, documents: [] })
      await poll(1)
      deps.registration.setStatus(id, { state: "failed", error: { code: 999, details: [] }, documents: [] })
      await poll(2)

      expect(warn).toHaveBeenCalledTimes(1)
      const [line] = warn.mock.calls[0]
      expect(line).toEqual(expect.stringContaining("999"))
      expect(line).toEqual(expect.stringContaining(reference))
      for (const code of CODES) expect(line).not.toContain(String(code))
      warn.mockRestore()
    })

    it("backs off along the poll schedule while the KBA is still processing: 1, then 2, then 5 minutes", async () => {
      const { stored, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()
      const nextPoll = async () => (await stored(reference)).polling.nextPollAt?.toISOString()

      expect(await nextPoll()).toBe("2026-03-01T09:01:00.000Z")
      await poll(1)
      expect(await nextPoll()).toBe("2026-03-01T09:03:00.000Z")
      await poll(2)
      expect(await nextPoll()).toBe("2026-03-01T09:08:00.000Z")
    })

    it("backs off on a rate limit without changing anything the customer sees", async () => {
      const { deps, emails, stored, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()

      deps.registration.failNext("getStatus", new GatewayUnavailable(20 * MINUTE))
      await poll(1)

      expect((await stored(reference)).polling.nextPollAt).toEqual(new Date("2026-03-01T09:21:00.000Z"))
      expect((await stored(reference)).status).toBe("submitted_to_kba")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
    })
  })

  describe("refund email 6, sent once the payment provider confirms the refund", () => {
    const finalFailure = { state: "failed", error: { code: 202, details: [] }, documents: [] } as const

    it.each(["card", "sepaDebit"] as const)(
      "tells a %s customer what came back: everything but the processing fee",
      async (method) => {
        const { deps, emails, zulexId, poll, checkoutAndPay } = setup()
        const reference = await checkoutAndPay(method)
        deps.registration.setStatus(await zulexId(reference), finalFailure)
        await poll(1)

        await confirmRefund(deps, reference)

        expect(emails()).toEqual(["orderConfirmation", "submittedToKba", "rejected", "refundIssued"])
        expect(deps.mailer.sent.at(-1)?.template).toMatchObject({ amount: SERVICE_PRICES.deregistration.subtract(PROCESSING_FEE) })
      },
    )

    it("sends nothing for an order that kept all its money", async () => {
      const { deps, emails, zulexId, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()
      deps.registration.setStatus(await zulexId(reference), { state: "finished", documents: [] })
      await poll(1)

      await confirmRefund(deps, reference)

      expect(emails()).toEqual(["orderConfirmation", "submittedToKba", "completed"])
    })
  })

  describe("J3–J5, rejections", () => {
    it("makes data refused at submission correctable straight away, leaving the payment untouched", async () => {
      const { deps, emails, stored, payment, checkoutAndPay } = setup()
      deps.registration.failNext("submit", new GatewayRejected())
      const reference = await checkoutAndPay()

      expect((await stored(reference)).status).toBe("failed_correctable")
      expect(emails()).toEqual(["orderConfirmation", "correctionRequired"])
      expect((await payment(reference)).status).toBe("held")
    })

    it("keeps the processing fee on a non-correctable KBA error and returns the rest", async () => {
      const { deps, emails, stored, zulexId, payment, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay("card")

      deps.registration.setStatus(await zulexId(reference), { state: "failed", error: { code: 202, details: [] }, documents: [] })
      await poll(1)

      expect((await stored(reference)).status).toBe("failed_final")
      expect(await payment(reference)).toMatchObject({
        status: "captured",
        captured: SERVICE_PRICES.deregistration,
        refunded: SERVICE_PRICES.deregistration.subtract(PROCESSING_FEE),
      })
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba", "rejected", "refundIssued"])
    })

    it("completes a finished application that has a confirmation, even alongside a rejection document", async () => {
      const { deps, stored, zulexId, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()
      const documents = [{ id: "8", kind: "rejection" }, { id: "9", kind: "confirmation" }] as const
      for (const { id } of documents) deps.registration.setDocument(id, new TextEncoder().encode("%PDF"))

      deps.registration.setStatus(await zulexId(reference), { state: "finished", documents })
      await poll(1)

      expect((await stored(reference)).status).toBe("completed")
    })

    it("makes a finished application with only a rejection document correctable", async () => {
      const { deps, stored, zulexId, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay()

      deps.registration.setStatus(await zulexId(reference), { state: "finished", documents: [{ id: "8", kind: "rejection" }] })
      await poll(1)

      expect((await stored(reference)).status).toBe("failed_correctable")
    })
  })

  describe("what the application remembers of a failure, for the page and the email", () => {
    it("keeps the KBA's code of a correctable and of a non-correctable error", async () => {
      const { deps, stored, zulexId, poll, checkoutAndPay } = setup()
      const correctable = await checkoutAndPay()
      const final = await checkoutAndPay()
      deps.registration.setStatus(await zulexId(correctable), { state: "failed", error: { code: 101, details: [] }, documents: [] })
      deps.registration.setStatus(await zulexId(final), { state: "failed", error: { code: 202, details: [] }, documents: [] })

      await poll(1)

      expect((await stored(correctable)).failure).toEqual({ kind: "kbaError", code: 101 })
      expect((await stored(final)).failure).toEqual({ kind: "kbaError", code: 202 })
    })

    it("puts the catalogue's reason in the correction email and in the rejection email", async () => {
      const { deps, zulexId, poll, checkoutAndPay } = setup()
      const correctable = await checkoutAndPay()
      const final = await checkoutAndPay()
      deps.registration.setStatus(await zulexId(correctable), { state: "failed", error: { code: 101, details: [] }, documents: [] })
      deps.registration.setStatus(await zulexId(final), { state: "failed", error: { code: 202, details: [] }, documents: [] })

      await poll(1)

      const sent = (name: string) => deps.mailer.sent.map(({ template }) => template).find((template) => template.name === name)
      expect(sent("correctionRequired")).toMatchObject({ reason: "Die FIN wurde nicht akzeptiert." })
      expect(sent("rejected")).toMatchObject({ reason: "Das Fahrzeug ist bereits abgemeldet." })
    })

    it("keeps that data was refused at submission, and that a rejection document came back", async () => {
      const { deps, stored, zulexId, poll, checkoutAndPay } = setup()
      deps.registration.failNext("submit", new GatewayRejected())
      const refused = await checkoutAndPay()
      const documented = await checkoutAndPay()
      deps.registration.setStatus(await zulexId(documented), { state: "finished", documents: [{ id: "8", kind: "rejection" }] })

      await poll(1)

      expect((await stored(refused)).failure).toEqual({ kind: "rejected" })
      expect((await stored(documented)).failure).toEqual({ kind: "rejectionDocument" })
    })
  })

  it.each([
    ["completed", { state: "finished", documents: [] }],
    ["failed_final", { state: "failed", error: { code: 202, details: [] }, documents: [] }],
  ] as const)("stops scheduling checks once an application is %s, so nothing looks overdue", async (status, gatewayStatus) => {
    const { deps, stored, zulexId, poll, checkoutAndPay } = setup()
    const reference = await checkoutAndPay()

    deps.registration.setStatus(await zulexId(reference), gatewayStatus)
    await poll(1)

    expect((await stored(reference)).status).toBe(status)
    expect((await stored(reference)).polling.nextPollAt).toBeUndefined()
  })

  it("keeps polling the others when one application fails unexpectedly", async () => {
    const { deps, stored, zulexId, poll, checkoutAndPay } = setup()
    const broken = await checkoutAndPay()
    const healthy = await checkoutAndPay()
    const unreadable = { get state(): never { throw new Error("unexpected vendor payload") } } as never
    deps.registration.setStatus(await zulexId(broken), unreadable)
    deps.registration.setStatus(await zulexId(healthy), { state: "finished", documents: [] })

    const result = await poll(1)

    expect(result).toEqual({ checked: 2, failed: 1 })
    expect((await stored(healthy)).status).toBe("completed")
  })

  it("never puts a security code in any email", async () => {
    const { deps, zulexId, poll, checkoutAndPay } = setup()
    const reference = await checkoutAndPay()
    deps.registration.setStatus(await zulexId(reference), { state: "failed", error: { code: 202, details: [] }, documents: [] })
    await poll(1)

    const everything = JSON.stringify(deps.mailer.sent)

    for (const code of CODES) expect(everything).not.toContain(code)
  })
})
