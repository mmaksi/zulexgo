import { applyEvent } from "@/src/core/domain/application/application"
import type { ApplicationEvent } from "@/src/core/domain/application/application-status"
import { reportOrders } from "@/src/core/use-cases/monitoring/report-orders"
import { aNewRegistrationApplication, anApplication } from "@/tests/fixtures/applications"
import { secretsOf } from "@/tests/fixtures/secrets"
import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import { setupFlow } from "./flow-harness"

const DAY = 24 * 60 * 60_000

/** An order that reached `events` in turn, the first an hour after `start`. */
function lived(order: ReturnType<typeof aNewRegistrationApplication>, start: Date, events: ApplicationEvent[]) {
  let current = { ...order, history: [{ status: order.status, at: start }] }
  events.forEach((event, index) => {
    current = applyEvent(current, event, new Date(start.getTime() + (index + 1) * 3_600_000))
  })
  return current
}

describe("the monitoring report", () => {
  it("counts what happened to the orders of each service in the window, and leaves older ones out", async () => {
    const { deps, clock } = setupFlow()
    const now = clock.now()
    const inWindow = new Date(now.getTime() - 2 * DAY)
    const tooOld = new Date(now.getTime() - 40 * DAY)
    const deadline = new Date(now.getTime() - 3_600_000)

    const verified = lived(aNewRegistrationApplication(), inWindow, ["paymentConfirmed", "identityVerificationStarted", "identityVerified", "submittedToKba", "kbaCompleted"])
    const stuck = lived(aNewRegistrationApplication(), inWindow, ["paymentConfirmed", "identityVerificationStarted"])
    const expired = lived(aNewRegistrationApplication(), inWindow, ["paymentConfirmed", "identityVerificationStarted", "identityVerificationExpired"])
    const old = lived(aNewRegistrationApplication(), tooOld, ["paymentConfirmed", "identityVerificationStarted"])
    for (const order of [verified, stuck, expired, old]) {
      await deps.repository.create({ ...order, identityVerification: { id: "verification", deadline, reminderSent: false } })
    }
    await deps.repository.create(anApplication({ history: [{ status: "awaiting_payment", at: inWindow }] }))

    const report = await reportOrders(deps, 30)

    expect(report.services.newRegistration).toMatchObject({
      orders: 3,
      completed: 1,
      verification: { sent: 3, verified: 1, expired: 1, unresolved: 1, stuck: 1, waiting: 0, abandonmentRate: 0.5 },
    })
    expect(report.services.deregistration.orders).toBe(1)
    expect(report.since).toEqual(new Date(now.getTime() - 30 * DAY))
    expect(report.generatedAt).toEqual(now)
  })

  it("carries nothing a customer entered, so it can be handed to a monitoring tool as it is", async () => {
    const { deps } = setupFlow()
    const order = aNewRegistrationApplication()
    await deps.repository.create({ ...order, history: [{ status: "awaiting_payment", at: deps.clock.now() }] })

    const text = JSON.stringify(await reportOrders(deps, 30))

    for (const secret of secretsOf(order.request)) expect(text).not.toContain(secret)
    expect(text).not.toContain(order.email)
    expect(text).not.toContain(FAKE_NEW_REGISTRATION.vin)
    expect(text).not.toContain(order.reference)
  })
})
