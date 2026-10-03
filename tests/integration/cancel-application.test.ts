import { Money } from "@/src/core/domain/payment/money"
import { DEREGISTRATION_TOTAL, PROCESSING_FEE } from "@/src/core/domain/payment/pricing"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"
import { StaleApplication } from "@/src/core/errors/application/stale-application"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import { cancelApplication } from "@/src/core/use-cases/application/cancel-application"
import { CODES, MINUTE, setupFlow } from "./flow-harness"

/** M6, 5b option B: the customer cancels; 19.99 € stays, the rest goes back, and email 6 follows. */
const REFUND = DEREGISTRATION_TOTAL.subtract(PROCESSING_FEE)

/** A 5b whose card was already captured, as an online authority's is once the KBA refuses the data. */
async function correctableAfterCapture() {
  const flow = setupFlow()
  const reference = await flow.checkoutAndPay("card")
  flow.deps.registration.setStatus(await flow.zulexId(reference), { state: "failed", error: { code: 101, details: [] }, documents: [] })
  await flow.poll(1)
  return { ...flow, reference }
}

/** A 5b whose card is still held: the service refused the data before accepting anything. */
async function correctableBeforeCapture() {
  const flow = setupFlow()
  flow.deps.registration.failNext("submit", new GatewayRejected())
  const reference = await flow.checkoutAndPay("card")
  return { ...flow, reference }
}

const tokenOf = async (flow: Awaited<ReturnType<typeof correctableAfterCapture>>) => (await flow.deps.repository.getStatusToken(flow.reference))!

describe("cancelApplication", () => {
  it("refunds all but the fee of a captured payment, marks the order cancelled and sends email 6 with that amount", async () => {
    const flow = await correctableAfterCapture()

    await cancelApplication(flow.deps, await tokenOf(flow))

    expect((await flow.stored(flow.reference)).status).toBe("cancelled")
    expect(await flow.payment(flow.reference)).toMatchObject({ status: "captured", captured: DEREGISTRATION_TOTAL, refunded: REFUND })
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba", "correctionRequired", "refundIssued"])
    expect(flow.deps.mailer.sent.at(-1)?.template).toMatchObject({ name: "refundIssued", amount: REFUND })
  })

  it("takes only the fee from a card still held, which lets the rest go", async () => {
    const flow = await correctableBeforeCapture()

    await cancelApplication(flow.deps, await tokenOf(flow))

    expect(await flow.payment(flow.reference)).toMatchObject({ status: "captured", captured: PROCESSING_FEE, refunded: Money.ofCents(0) })
    expect(flow.deps.mailer.sent.at(-1)?.template).toMatchObject({ name: "refundIssued", amount: REFUND })
  })

  it("stops watching the order: a cancelled order is never polled again", async () => {
    const flow = await correctableBeforeCapture()

    await cancelApplication(flow.deps, await tokenOf(flow))

    expect((await flow.stored(flow.reference)).polling.nextPollAt).toBeUndefined()
    expect((await flow.poll(24 * 60)).checked).toBe(0)
  })

  it("does nothing twice when asked twice: one refund, one email", async () => {
    const flow = await correctableAfterCapture()
    const token = await tokenOf(flow)

    await cancelApplication(flow.deps, token)
    await cancelApplication(flow.deps, token)

    expect((await flow.payment(flow.reference)).refunded).toEqual(REFUND)
    expect(flow.emails().filter((name) => name === "refundIssued")).toHaveLength(1)
  })

  it.each(["submitted_to_kba", "completed", "failed_final"] as const)("refuses an order that is %s, and moves no money", async (target) => {
    const flow = setupFlow()
    const reference = await flow.checkoutAndPay("card")
    const id = await flow.zulexId(reference)
    if (target === "completed") flow.deps.registration.setStatus(id, { state: "finished", documents: [] })
    if (target === "failed_final") flow.deps.registration.setStatus(id, { state: "failed", error: { code: 202, details: [] }, documents: [] })
    await flow.poll(1)
    const before = await flow.payment(reference)
    const emailsBefore = flow.emails()

    await expect(cancelApplication(flow.deps, (await flow.deps.repository.getStatusToken(reference))!)).rejects.toBeInstanceOf(InvalidTransition)

    expect(await flow.payment(reference)).toEqual(before)
    expect(flow.emails()).toEqual(emailsBefore)
  })

  it.each(["faketoken-unknown", ""])("refuses a link no order answers to (%p)", async (token) => {
    const flow = await correctableAfterCapture()

    await expect(cancelApplication(flow.deps, token)).rejects.toBeInstanceOf(TokenInvalid)
    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")
  })

  it("finishes where it stopped when the refund email failed: the money moved once, the email goes out on the rerun", async () => {
    const flow = await correctableAfterCapture()
    const token = await tokenOf(flow)
    jest.spyOn(flow.deps.mailer, "send").mockRejectedValueOnce(new Error("Resend is down"))

    await expect(cancelApplication(flow.deps, token)).rejects.toThrow("Resend is down")
    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")

    await cancelApplication(flow.deps, token)

    expect((await flow.stored(flow.reference)).status).toBe("cancelled")
    expect((await flow.payment(flow.reference)).refunded).toEqual(REFUND)
    expect(flow.emails().filter((name) => name === "refundIssued")).toHaveLength(1)
  })

  it("loses to a change made since it read the order, before any money moves, and completes when asked again", async () => {
    const flow = await correctableBeforeCapture()
    const token = await tokenOf(flow)
    const stale = (await flow.deps.repository.findByStatusToken(token))!
    await flow.deps.repository.update(stale)
    jest.spyOn(flow.deps.repository, "findByStatusToken").mockResolvedValueOnce(stale)

    const before = await flow.payment(flow.reference)

    await expect(cancelApplication(flow.deps, token)).rejects.toBeInstanceOf(StaleApplication)
    expect(await flow.payment(flow.reference)).toEqual(before)
    expect(flow.emails()).not.toContain("refundIssued")

    await cancelApplication(flow.deps, token)
    expect((await flow.stored(flow.reference)).status).toBe("cancelled")
    expect(flow.emails().filter((name) => name === "refundIssued")).toHaveLength(1)
  })

  it("still cancels an order whose hold lapsed meanwhile, returning what the customer already got back", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const flow = await correctableBeforeCapture()
    flow.clock.advance(8 * 24 * 60 * MINUTE)

    await cancelApplication(flow.deps, await tokenOf(flow))

    expect((await flow.stored(flow.reference)).status).toBe("cancelled")
    expect(flow.deps.mailer.sent.at(-1)?.template).toMatchObject({ name: "refundIssued", amount: DEREGISTRATION_TOTAL })
    warn.mockRestore()
  })

  it("puts no security code in the email", async () => {
    const flow = await correctableAfterCapture()

    await cancelApplication(flow.deps, await tokenOf(flow))

    const everything = JSON.stringify(flow.deps.mailer.sent)
    for (const code of CODES) expect(everything).not.toContain(code)
  })
})
