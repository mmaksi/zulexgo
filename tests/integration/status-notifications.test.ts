import { renderEmail } from "@/src/adapters/mail/resend/render"
import type { ApplicationReference } from "@/src/core/domain/application-reference"
import { Money } from "@/src/core/domain/money"
import { DEREGISTRATION_TOTAL, PROCESSING_FEE } from "@/src/core/domain/pricing"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import type { EmailTemplate } from "@/src/core/ports/mailer"
import { confirmRefund } from "@/src/core/use-cases/confirm-refund"
import { CODES, keepServiceDown, setupFlow } from "./flow-harness"

const FINISHED = { state: "finished", documents: [] } as const
const CORRECTABLE = { state: "failed", error: { code: 101, details: [] }, documents: [] } as const
const FINAL = { state: "failed", error: { code: 202, details: [] }, documents: [] } as const

type Flow = ReturnType<typeof setupFlow>

/** The next send of this email throws once, as Resend does when it is down, and every other send goes through. */
function failMailerOnce(flow: Flow, name: EmailTemplate["name"]) {
  const send = flow.deps.mailer.send.bind(flow.deps.mailer)
  let failed = false
  jest.spyOn(flow.deps.mailer, "send").mockImplementation(async (message) => {
    if (message.template.name === name && !failed) {
      failed = true
      throw new Error("Resend refused the message")
    }
    return send(message)
  })
}

async function reachKba(flow: Flow) {
  const reference = await flow.checkoutAndPay("card")
  return { reference, id: await flow.zulexId(reference) }
}

describe("status notifications: one email per transition", () => {
  it("1 → 4 → 5a sends emails 1, 4 and 5a, once each, and nothing on a poll that changes nothing", async () => {
    const flow = setupFlow()
    const { id } = await reachKba(flow)

    await flow.poll(1)
    flow.deps.registration.setStatus(id, FINISHED)
    await flow.poll(2)
    await flow.poll(10)

    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba", "completed"])
  })

  it("sends nothing while a technical error is retried silently, before or after submission", async () => {
    const flow = setupFlow()
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    const reference = await flow.checkoutAndPay()
    expect(flow.emails()).toEqual(["orderConfirmation"])

    await flow.poll(1)
    const id = await flow.zulexId(reference)
    flow.deps.registration.setStatus(id, { state: "failed", error: { code: 999, details: [] }, documents: [] })
    await flow.poll(1)

    expect(flow.deps.registration.retries).toEqual([id])
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba"])
  })

  it("5b: a correctable error sends email 5b and neither takes nor returns money (an online authority's order was paid for at acceptance)", async () => {
    const flow = setupFlow()
    const { reference, id } = await reachKba(flow)

    flow.deps.registration.setStatus(id, CORRECTABLE)
    await flow.poll(1)

    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba", "correctionRequired"])
    expect(await flow.payment(reference)).toMatchObject({ status: "captured", captured: DEREGISTRATION_TOTAL, refunded: Money.ofCents(0) })
  })

  it("5c: a final error sends 5c, then email 6 with what comes back, and a later refund confirmation adds nothing", async () => {
    const flow = setupFlow()
    const { reference, id } = await reachKba(flow)

    flow.deps.registration.setStatus(id, FINAL)
    await flow.poll(1)

    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba", "rejected", "refundIssued"])
    await confirmRefund(flow.deps, reference)
    expect(flow.emails()).toHaveLength(4)
    const [, , rejected, refund] = flow.deps.mailer.sent.map(({ template }) => template)
    expect(rejected).toMatchObject({ retained: PROCESSING_FEE })
    expect(refund).toMatchObject({ amount: DEREGISTRATION_TOTAL.subtract(PROCESSING_FEE) })
  })

  it("our own technical error: 5c and email 6 for the whole price, with no fee named", async () => {
    const flow = setupFlow()
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    await flow.checkoutAndPay()
    await keepServiceDown(flow, 24)

    expect(flow.emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])
    const [, rejected, refund] = flow.deps.mailer.sent.map(({ template }) => template)
    expect(rejected).toMatchObject({ refund: DEREGISTRATION_TOTAL })
    expect(rejected).toMatchObject({ retained: expect.objectContaining({ cents: 0 }) })
    expect(refund).toMatchObject({ amount: DEREGISTRATION_TOTAL })
  })

  it("sends no refund email for an order that kept all its money", async () => {
    const flow = setupFlow()
    const { id } = await reachKba(flow)

    flow.deps.registration.setStatus(id, FINISHED)
    await flow.poll(1)

    expect(flow.emails()).not.toContain("refundIssued")
  })
})

describe("status notifications: an email that could not be sent is not lost", () => {
  it("email 4: the transition waits, the next tick after the backoff sends it once, and only then is the KBA asked about", async () => {
    const flow = setupFlow()
    failMailerOnce(flow, "submittedToKba")
    const submit = jest.spyOn(flow.deps.registration, "submitDeregistration")
    const reference = await flow.payForCheckout()

    await expect(flow.confirm(reference)).rejects.toThrow("Resend refused")
    expect((await flow.stored(reference)).status).toBe("submitted_and_paid")
    expect(flow.emails()).toEqual(["orderConfirmation"])
    expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })

    await flow.poll(1)

    expect((await flow.stored(reference)).status).toBe("submitted_to_kba")
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba"])
    // Zulex's answer to a replayed submission is unspecified (Q23), so a failed email must never cause one.
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it("email 5a: the confirmation is still stored and the card still captured once, and the email goes out after backoff", async () => {
    const flow = setupFlow()
    const { reference, id } = await reachKba(flow)
    failMailerOnce(flow, "completed")

    flow.deps.registration.setDocument("9", new TextEncoder().encode("%PDF"))
    flow.deps.registration.setStatus(id, { state: "finished", documents: [{ id: "9", kind: "confirmation" }] })
    expect(await flow.poll(1)).toMatchObject({ failed: 1 })
    expect((await flow.stored(reference)).status).toBe("submitted_to_kba")

    expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })
    await flow.poll(2)

    expect((await flow.stored(reference)).status).toBe("completed")
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba", "completed"])
    expect(await flow.deps.documents.list(reference)).toEqual([{ id: "9", kind: "confirmation" }])
    expect(await flow.payment(reference)).toMatchObject({ status: "captured", captured: DEREGISTRATION_TOTAL })
  })

  it("email 5b: the status waits for the email", async () => {
    const flow = setupFlow()
    const { reference, id } = await reachKba(flow)
    failMailerOnce(flow, "correctionRequired")

    flow.deps.registration.setStatus(id, CORRECTABLE)
    expect(await flow.poll(1)).toMatchObject({ failed: 1 })
    expect((await flow.stored(reference)).status).toBe("submitted_to_kba")

    expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })
    await flow.poll(2)

    expect((await flow.stored(reference)).status).toBe("failed_correctable")
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba", "correctionRequired"])
  })

  it.each(["rejected", "refundIssued"] as const)(
    "email %s: a rerun does not take the fee twice or refund twice, and each email is sent once",
    async (failing) => {
      const flow = setupFlow()
      const { reference, id } = await reachKba(flow)
      failMailerOnce(flow, failing)

      flow.deps.registration.setStatus(id, FINAL)
      expect(await flow.poll(1)).toMatchObject({ failed: 1 })
      expect((await flow.stored(reference)).status).toBe("submitted_to_kba")

      expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })
      await flow.poll(2)

      expect((await flow.stored(reference)).status).toBe("failed_final")
      expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba", "rejected", "refundIssued"])
      expect(await flow.payment(reference)).toMatchObject({
        status: "captured",
        captured: DEREGISTRATION_TOTAL,
        refunded: DEREGISTRATION_TOTAL.subtract(PROCESSING_FEE),
      })
    },
  )

  it("email 6: a refund email that fails after our own technical error is sent after a backoff of at most an hour, for the whole price", async () => {
    const flow = setupFlow()
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    const reference = await flow.checkoutAndPay()
    await keepServiceDown(flow, 23)
    failMailerOnce(flow, "refundIssued")

    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    expect(await flow.poll(60)).toMatchObject({ failed: 1 })
    expect(await flow.poll(0)).toEqual({ checked: 0, failed: 0 })
    await flow.poll(60)

    expect((await flow.stored(reference)).status).toBe("failed_final")
    expect(flow.emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])
    expect(await flow.payment(reference)).toMatchObject({ status: "released" })
  })
})

describe("status notifications: a step that keeps failing is not silent", () => {
  it("names the order and the kind of error in the log, never the message, which may hold an address", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const flow = setupFlow()
    const { reference, id } = await reachKba(flow)
    jest.spyOn(flow.deps.mailer, "send").mockRejectedValue(new Error(`Resend refused ${"customer@example.test"}`))

    flow.deps.registration.setStatus(id, FINISHED)
    await flow.poll(1)

    const logged = error.mock.calls.flat().join(" ")
    expect(logged).toContain(reference)
    expect(logged).toContain("Error")
    expect(logged).not.toContain("customer@example.test")
    error.mockRestore()
  })
})

describe("status notifications: money that already went back", () => {
  it("never files an application whose payment was released, and tells the customer it is refunded", async () => {
    const flow = setupFlow()
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    const reference = await flow.checkoutAndPay()
    await flow.deps.payments.release((await flow.stored(reference)).payment.id)

    await flow.poll(1)

    expect(flow.deps.registration.submissions).toEqual([])
    expect((await flow.stored(reference)).status).toBe("failed_final")
    expect(flow.emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])
  })
})

describe("status notifications: money that went back by refund", () => {
  it("never files an application whose captured payment was refunded in full", async () => {
    const flow = setupFlow()
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    const reference = await flow.checkoutAndPay("sepaDebit")
    await flow.deps.payments.refund((await flow.stored(reference)).payment.id, DEREGISTRATION_TOTAL, "test-refund")

    await flow.poll(1)

    expect(flow.deps.registration.submissions).toEqual([])
    expect((await flow.stored(reference)).status).toBe("failed_final")
    expect(flow.emails()).toEqual(["orderConfirmation", "rejected", "refundIssued"])
  })
})

describe("status notifications: what an email may carry", () => {
  it("names no security code, and links nowhere but to the order's own status link, in any body", async () => {
    const flow = setupFlow()
    const { reference, id } = await reachKba(flow)
    flow.deps.registration.setStatus(id, FINAL)
    await flow.poll(1)
    const second = await reachKba(flow)
    flow.deps.registration.setStatus(second.id, FINISHED)
    await flow.poll(1)
    const third = await reachKba(flow)
    flow.deps.registration.setStatus(third.id, CORRECTABLE)
    await flow.poll(1)

    const statusLinks = new Map<ApplicationReference, string>()
    for (const order of [reference, second.reference, third.reference]) {
      statusLinks.set(order, flow.deps.statusLink((await flow.deps.repository.getStatusToken(order))!))
    }

    const sent = flow.deps.mailer.sent
    expect(sent.length).toBeGreaterThanOrEqual(9)
    for (const { template } of sent) {
      const { subject, html, text } = await renderEmail(template)
      const everything = `${subject}\n${html}\n${text}`

      for (const code of CODES) expect(everything).not.toContain(code)
      const links = [...html.matchAll(/href="(https?:[^"]*)"/g)].map(([, href]) => href)
      expect(links).toEqual("statusLink" in template ? [statusLinks.get(template.reference)] : [])
    }
  })
})
