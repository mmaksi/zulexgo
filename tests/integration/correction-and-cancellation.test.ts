import { handlePaymentNotification } from "@/app/api/webhooks/stripe/handle"
import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { submitCheckout } from "@/src/core/use-cases/submit-checkout"
import { cancelApplication } from "@/src/core/use-cases/cancel-application"
import { correctApplication } from "@/src/core/use-cases/correct-application"
import { pollDueApplications } from "@/src/core/use-cases/poll-due-applications"
import { webhookRequest, withVendorsAtTheNetwork } from "./network-harness"

/**
 * M6 through the real Stripe and Zulex adapters, both stubbed at the network:
 * what a cancel asks Stripe for, and what a correction sends Zulex.
 */
const { world, stored, emails } = withVendorsAtTheNetwork()
const MINUTE = 60_000

async function payAndFile() {
  const { reference } = await submitCheckout(world.deps, { request: FAKE_REQUEST, email: "customer@example.test" })
  const { payment } = await stored(reference)
  world.stripe.customerPays(payment.id, "card")
  await handlePaymentNotification(world.deps, webhookRequest(world.stripe.event("payment_intent.amount_capturable_updated", payment.id)))
  return { reference, paymentId: payment.id, token: (await world.deps.repository.getStatusToken(reference))! }
}

/** The KBA finished with only a rejection document: correctable, so 5b. */
async function rejectedByKba() {
  const filed = await payAndFile()
  const zulexId = (await stored(filed.reference)).zulexApplicationId!
  world.zulex.setStatus(zulexId, "FINISHED", { documents: [{ id: "9007199254740993", type: "REJECTION" }] })
  world.clock.advance(MINUTE)
  await pollDueApplications(world.deps, 10)
  return { ...filed, zulexId }
}

describe("cancelling a 5b, through Stripe", () => {
  it("takes only the fee from a card still held, which lets Stripe release the rest", async () => {
    world.zulex.failNext("create", new Response(null, { status: 400 }))
    const { reference, paymentId, token } = await payAndFile()
    expect((await stored(reference)).status).toBe("failed_correctable")
    expect(world.stripe.intents.get(paymentId)?.status).toBe("requires_capture")

    await cancelApplication(world.deps, token)

    expect(world.stripe.intents.get(paymentId)).toMatchObject({ status: "succeeded", amount_received: 1999 })
    expect(world.stripe.sent.some((body) => body.includes("amount_to_capture=1999"))).toBe(true)
    expect((await stored(reference)).status).toBe("cancelled")
    expect(world.mailer.sent.at(-1)?.template).toMatchObject({ name: "refundIssued", amount: { cents: 2901 } })
  })

  it("refunds all but the fee of a card that was taken when the KBA refused the data", async () => {
    const { reference, paymentId, token } = await rejectedByKba()
    expect(world.stripe.intents.get(paymentId)).toMatchObject({ status: "succeeded", amount_received: 4900 })

    await cancelApplication(world.deps, token)

    expect(world.stripe.sent.filter((body) => body.includes(`payment_intent=${paymentId}`) && body.includes("amount=2901"))).toHaveLength(1)
    expect((await stored(reference)).status).toBe("cancelled")
    expect(emails().filter((name) => name === "refundIssued")).toHaveLength(1)
  })

  it("refunds nothing twice when asked twice", async () => {
    const { paymentId, token } = await rejectedByKba()

    await cancelApplication(world.deps, token)
    await cancelApplication(world.deps, token)

    expect(world.stripe.sent.filter((body) => body.includes(`payment_intent=${paymentId}`) && body.includes("amount=2901"))).toHaveLength(1)
  })
})

describe("correcting a 5b, through Zulex", () => {
  it("patches the application the KBA refused with only the corrected fields, then it is at the KBA again", async () => {
    const { reference, zulexId, token } = await rejectedByKba()

    await correctApplication(world.deps, token, { vin: "FAKEVIN0000000009", certificate: "AAAAAA9" })

    const patch = world.zulex.requests.find((request) => request.method === "PATCH")
    expect(patch?.path).toMatch(new RegExp(`/deregistration-applications/${zulexId}$`))
    expect(patch?.body).toEqual({ vin: "FAKEVIN0000000009", securityCodeRegistrationCertificationPart1: "AAAAAA9" })
    expect((await stored(reference)).status).toBe("submitted_to_kba")
    expect(world.zulex.applications.get(zulexId)?.status).toBe("IN_PROGRESS")
    expect(emails()).toEqual(["orderConfirmation", "submittedToKba", "correctionRequired", "submittedToKba"])
  })

  it("files the corrected order afresh, under a new idempotency key, when Zulex refused it outright", async () => {
    world.zulex.failNext("create", new Response(null, { status: 400 }))
    const { reference, token } = await payAndFile()
    const firstKey = (await stored(reference)).idempotencyKey

    await correctApplication(world.deps, token, { vin: "FAKEVIN0000000009" })

    const creates = world.zulex.requests.filter((request) => request.method === "POST" && request.path.endsWith("/deregistration-applications"))
    expect(creates).toHaveLength(2)
    expect(creates[1].headers.get("X-Idempotency-Key")).not.toBe(firstKey)
    expect(creates[1].body).toMatchObject({ vin: "FAKEVIN0000000009" })
    expect(world.zulex.requests.some((request) => request.method === "PATCH")).toBe(false)
    expect((await stored(reference)).status).toBe("submitted_to_kba")
  })

  it("sends no security code to any log or email", async () => {
    const spies = (["log", "warn", "error", "info"] as const).map((method) => jest.spyOn(console, method).mockImplementation(() => {}))
    const { token } = await rejectedByKba()

    await correctApplication(world.deps, token, { certificate: "AAAAAA9" })

    const logged = spies.flatMap((spy) => spy.mock.calls.flat()).join(" ") + JSON.stringify(world.mailer.sent)
    for (const code of [...Object.values(FAKE_REQUEST.codes), "AAAAAA9"]) expect(logged).not.toContain(code)
    spies.forEach((spy) => spy.mockRestore())
  })
})
