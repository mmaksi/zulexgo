import { handlePaymentNotification } from "@/app/api/webhooks/stripe/handle"
import { handlePoll } from "@/app/api/internal/poll/handle"
import { seedFor } from "@/db/seed/seed"
import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { pollDueApplications } from "@/src/core/use-cases/registration/poll-due-applications"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { webhookRequest, withVendorsAtTheNetwork } from "./network-harness"

/** M4: the poll heartbeat advances a filed application from what Zulex reports, on the backoff schedule. */
const { world, stored, emails } = withVendorsAtTheNetwork()

const CRON_SECRET = "fake-cron-secret"
const MINUTE = 60_000

const heartbeat = (afterMinutes: number, authorization = `Bearer ${CRON_SECRET}`) => {
  world.clock.advance(afterMinutes * MINUTE)
  return handlePoll(
    { cronSecret: CRON_SECRET, poll: (limit) => pollDueApplications(world.deps, limit) },
    new Request("https://zulexgo.example.test/api/internal/poll", { headers: { authorization } }),
  )
}

async function filedApplication() {
  const { reference } = await submitCheckout(world.deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test" })
  const { payment } = await stored(reference)
  world.stripe.customerPays(payment.id, "card")
  await handlePaymentNotification(world.deps, webhookRequest(world.stripe.event("payment_intent.amount_capturable_updated", payment.id)))
  return { reference, paymentId: payment.id, zulexId: (await stored(reference)).zulexApplicationId! }
}

describe("status polling", () => {
  it("asks Zulex only once a check is due, then completes the application and captures the held card", async () => {
    const { reference, paymentId, zulexId } = await filedApplication()
    const statusChecks = () => world.zulex.requests.filter((request) => request.method === "GET" && request.path.endsWith(zulexId)).length

    expect(await (await heartbeat(0.5)).json()).toEqual({ checked: 0, failed: 0 })
    expect(statusChecks()).toBe(0)

    await heartbeat(0.5)
    expect(statusChecks()).toBe(1)
    expect((await stored(reference)).status).toBe("submitted_to_kba")

    world.zulex.setStatus(zulexId, "FINISHED", { documents: [{ id: "9007199254740993", type: "DEREGISTRATION_CONFIRMATION" }] })
    world.zulex.setDocument("9007199254740993", new TextEncoder().encode("%PDF-fake"))
    await heartbeat(2)

    expect((await stored(reference)).status).toBe("completed")
    expect(world.stripe.intents.get(paymentId)).toMatchObject({ status: "succeeded", amount_received: 4900 })
    expect(await world.deps.documents.list(reference)).toEqual([{ id: "9007199254740993", kind: "confirmation" }])
    expect(emails()).toEqual(["orderConfirmation", "submittedToKba", "completed"])
  })

  it("keeps an application in progress while Zulex rate-limits, waiting as long as Retry-After asks", async () => {
    const { reference, zulexId } = await filedApplication()
    world.zulex.failNext("get", new Response(null, { status: 429, headers: { "Retry-After": "600" } }))

    await heartbeat(1)

    const { status, polling } = await stored(reference)
    expect(status).toBe("submitted_to_kba")
    expect(polling.nextPollAt!.getTime() - world.clock.now().getTime()).toBe(600_000)
    expect(world.zulex.requests.filter((request) => request.path.endsWith(zulexId))).toHaveLength(1)
  })

  it("backs off from an application Zulex has never heard of, like the seed's on staging, instead of asking every tick", async () => {
    const { application } = seedFor("staging").find(({ application }) => application.status === "submitted_to_kba")!
    await world.deps.repository.create(application)
    const statusChecks = () => world.zulex.requests.filter((request) => request.path.endsWith(application.zulexApplicationId!)).length

    expect(await (await heartbeat(0)).json()).toEqual({ checked: 1, failed: 1 })
    await heartbeat(1)

    expect(statusChecks()).toBe(1)
    expect((await stored(application.reference)).status).toBe("submitted_to_kba")
    expect(emails()).toEqual([])
  })

  it("refuses a heartbeat without the cron secret", async () => {
    const { zulexId } = await filedApplication()

    expect((await heartbeat(60, "Bearer guessed")).status).toBe(401)
    expect(world.zulex.requests.filter((request) => request.path.endsWith(zulexId))).toHaveLength(0)
  })
})
