import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { Money } from "@/src/core/domain/money"
import { DEREGISTRATION_TOTAL, PROCESSING_FEE } from "@/src/core/domain/pricing"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import { confirmPayment } from "@/src/core/use-cases/confirm-payment"
import { confirmRefund } from "@/src/core/use-cases/confirm-refund"
import { submitCheckout } from "@/src/core/use-cases/submit-checkout"
import { CODES, MINUTE, setupFlow as setup } from "./flow-harness"

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
      expect(await payment(reference)).toMatchObject({ status: "captured", captured: DEREGISTRATION_TOTAL })
      expect(await deps.documents.list(reference)).toEqual([{ id: "77", kind: "confirmation" }])
    })

    it("leaves a SEPA payment as it is on completion, since it was taken at checkout", async () => {
      const { deps, zulexId, payment, poll, checkoutAndPay } = setup()
      const reference = await checkoutAndPay("sepaDebit")

      deps.registration.setStatus(await zulexId(reference), { state: "finished", documents: [] })
      await poll(1)

      expect(await payment(reference)).toMatchObject({ status: "captured", captured: DEREGISTRATION_TOTAL })
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
      const { reference } = await submitCheckout(deps, { request: FAKE_REQUEST, email: "customer@example.test" })
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
      const { reference } = await submitCheckout(deps, { request: FAKE_REQUEST, email: "customer@example.test" })
      await deps.payments.customerPays((await stored(reference)).payment.id, "card")
      deps.registration.failNext("submit", new Error("the process died"))

      await expect(confirmPayment(deps, reference)).rejects.toThrow("the process died")
      await poll(0)

      expect((await stored(reference)).status).toBe("submitted_to_kba")
      expect(emails()).toEqual(["orderConfirmation", "submittedToKba"])
    })

    it("does nothing until the customer has actually paid", async () => {
      const { deps, emails, stored } = setup()
      const { reference } = await submitCheckout(deps, { request: FAKE_REQUEST, email: "customer@example.test" })

      await confirmPayment(deps, reference)

      expect((await stored(reference)).status).toBe("awaiting_payment")
      expect(emails()).toEqual([])
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

    it("fails for good with a full refund when the second attempt cannot reach the service either", async () => {
      const { deps, emails, stored, payment, poll, checkoutAndPay } = setup()
      deps.registration.failNext("submit", new GatewayUnavailable())
      const reference = await checkoutAndPay("card")

      deps.registration.failNext("submit", new GatewayUnavailable())
      await poll(1)

      expect((await stored(reference)).status).toBe("failed_final")
      expect(await payment(reference)).toMatchObject({ status: "released", captured: Money.ofCents(0) })
      expect(emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])

      await confirmRefund(deps, reference)

      expect(emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])
      expect(deps.mailer.sent.at(-1)?.template).toMatchObject({ amount: DEREGISTRATION_TOTAL })
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
        expect(deps.mailer.sent.at(-1)?.template).toMatchObject({ amount: DEREGISTRATION_TOTAL.subtract(PROCESSING_FEE) })
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
      expect(await payment(reference)).toMatchObject({ status: "captured", captured: PROCESSING_FEE })
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

  it.each([
    ["completed", { state: "finished", documents: [] }],
    ["failed_correctable", { state: "failed", error: { code: 101, details: [] }, documents: [] }],
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
