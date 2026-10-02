import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import { InvalidTransition } from "@/src/core/errors/invalid-transition"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import { ValidationError } from "@/src/core/errors/validation-error"
import { PaymentNoLongerWhole } from "@/src/core/errors/payment-no-longer-whole"
import { StaleApplication } from "@/src/core/errors/stale-application"
import { cancelApplication } from "@/src/core/use-cases/cancel-application"
import { correctApplication } from "@/src/core/use-cases/correct-application"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { CODES, setupFlow } from "./flow-harness"

/** M6, 5b option A: the customer corrects, the service resubmits to the KBA, and the order is back at status 4. */
const KBA_REFUSES = { state: "failed", error: { code: 101, details: [] }, documents: [] } as const

/** A 5b the KBA sent back after accepting the application: the service holds it, so the fix is a PATCH. */
async function refusedByKba() {
  const flow = setupFlow()
  const reference = await flow.checkoutAndPay("card")
  const id = await flow.zulexId(reference)
  flow.deps.registration.setStatus(id, KBA_REFUSES)
  await flow.poll(1)
  return { ...flow, reference, id, token: (await flow.deps.repository.getStatusToken(reference))! }
}

/** A 5b the service refused outright: it holds nothing, so the fix files the application afresh. */
async function refusedAtSubmission() {
  const flow = setupFlow()
  flow.deps.registration.failNext("submit", new GatewayRejected())
  const reference = await flow.checkoutAndPay("card")
  return { ...flow, reference, token: (await flow.deps.repository.getStatusToken(reference))! }
}

const newVin = { vin: "FAKEVIN0000000009", certificate: "AAAAAA9" }

it("refuses a correction when the provider amount differs from the stored order total", async () => {
  const flow = await refusedByKba()
  const application = await flow.stored(flow.reference)
  await flow.deps.repository.update({ ...application, payment: { ...application.payment, total: application.payment.total.add(application.payment.total) } })

  await expect(correctApplication(flow.deps, flow.token, newVin)).rejects.toBeInstanceOf(PaymentNoLongerWhole)
  expect(flow.deps.registration.corrections).toHaveLength(0)
  expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")
})

describe("correctApplication, an order the service holds", () => {
  it("patches only the corrected fields, then puts the order back at the KBA with email 4 again", async () => {
    const flow = await refusedByKba()

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("resubmitted")

    expect(flow.deps.registration.corrections).toHaveLength(1)
    const [{ applicationId, correction }] = flow.deps.registration.corrections
    expect(applicationId).toBe(flow.id)
    expect(correction.vin).toBe(newVin.vin)
    expect(correction.codes?.certificate?.reveal()).toBe(newVin.certificate)
    expect(correction.codes?.rearPlate).toBeUndefined()
    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
    expect(flow.emails()).toEqual(["orderConfirmation", "submittedToKba", "correctionRequired", "submittedToKba"])
  })

  it("stores the corrected values and forgets the failure and the retries used, so the order starts a new attempt", async () => {
    const flow = await refusedByKba()

    await correctApplication(flow.deps, flow.token, newVin)

    const stored = await flow.stored(flow.reference)
    expect(stored.request.vin).toBe(newVin.vin)
    expect(stored.request.codes.certificate.reveal()).toBe(newVin.certificate)
    expect(stored.request.codes.rearPlate.reveal()).toBe(FAKE_REQUEST.codes.rearPlate)
    expect(stored.failure).toBeUndefined()
    expect(stored.retryAttempts).toBe(0)
    expect(stored.polling.nextPollAt).toBeDefined()
  })

  it("is checked at the KBA again, and can complete", async () => {
    const flow = await refusedByKba()
    await correctApplication(flow.deps, flow.token, newVin)
    flow.deps.registration.setStatus(flow.id, { state: "finished", documents: [] })

    await flow.poll(2)

    expect((await flow.stored(flow.reference)).status).toBe("completed")
    expect(flow.emails().at(-1)).toBe("completed")
  })

  it("still gets its one silent retry for a technical error at the KBA the second time round", async () => {
    const flow = await refusedByKba()
    await correctApplication(flow.deps, flow.token, newVin)
    flow.deps.registration.setStatus(flow.id, { state: "failed", error: { code: 999, details: [] }, documents: [] })

    await flow.poll(2)

    expect(flow.deps.registration.retries).toEqual([flow.id])
    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
  })

  it("leaves the order at 5b, changed in no way, when the service refuses the corrected data", async () => {
    const flow = await refusedByKba()
    jest.spyOn(flow.deps.registration, "correct").mockRejectedValueOnce(new GatewayRejected())
    const before = await flow.stored(flow.reference)
    const emailsBefore = flow.emails()

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("refused")

    expect(await flow.stored(flow.reference)).toEqual({ ...before, version: expect.any(Number) })
    expect(flow.emails()).toEqual(emailsBefore)
  })

  it("leaves the order at 5b, changed in no way, when the service cannot be reached, and lets the customer try again", async () => {
    const flow = await refusedByKba()
    flow.deps.registration.failNext("correct", new GatewayUnavailable())
    const before = await flow.stored(flow.reference)

    await expect(correctApplication(flow.deps, flow.token, newVin)).rejects.toBeInstanceOf(GatewayUnavailable)
    expect(await flow.stored(flow.reference)).toEqual({ ...before, version: expect.any(Number) })

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("resubmitted")
  })

  it("puts the order back at the KBA even when the email cannot be sent, and says in the log which email was lost", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const flow = await refusedByKba()
    jest.spyOn(flow.deps.mailer, "send").mockRejectedValueOnce(new Error(`Resend refused ${flow.deps.mailer.sent.length} customer@example.test`))

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("resubmitted")

    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
    const logged = error.mock.calls.flat().join(" ")
    expect(logged).toContain(flow.reference)
    expect(logged).toContain("Error")
    expect(logged).not.toContain("customer@example.test")
    error.mockRestore()
  })

  it("is polled again after a correction whose email was lost, so the order cannot be left at 5b while the service finishes it", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const flow = await refusedByKba()
    jest.spyOn(flow.deps.mailer, "send").mockRejectedValueOnce(new Error("Resend is down"))
    await correctApplication(flow.deps, flow.token, newVin)
    flow.deps.registration.setStatus(flow.id, { state: "finished", documents: [] })

    await flow.poll(2)

    expect((await flow.stored(flow.reference)).status).toBe("completed")
    expect(flow.emails().at(-1)).toBe("completed")
    error.mockRestore()
  })

  it("does not patch twice when the first attempt got as far as the service and the order could not be saved after it", async () => {
    const flow = await refusedByKba()
    jest.spyOn(flow.deps.repository, "update").mockImplementation(async (application) => {
      if (application.status === "submitted_to_kba") throw new Error("database unreachable")
      return InMemoryApplicationRepository.prototype.update.call(flow.deps.repository, application)
    })

    await expect(correctApplication(flow.deps, flow.token, newVin)).rejects.toThrow("database unreachable")
    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")
    expect(flow.deps.registration.corrections).toHaveLength(1)
    jest.restoreAllMocks()

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("resubmitted")

    expect(flow.deps.registration.corrections).toHaveLength(1)
    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
  })

  it.each([
    ["nothing filled in", {}],
    ["a code of the wrong length", { certificate: "AAAA" }],
    ["a malformed VIN", { vin: "not a vin!" }],
  ])("asks again for %s, without reaching the service", async (_, input) => {
    const flow = await refusedByKba()
    const getStatus = jest.spyOn(flow.deps.registration, "getStatus")

    await expect(correctApplication(flow.deps, flow.token, input)).rejects.toBeInstanceOf(ValidationError)

    expect(getStatus).not.toHaveBeenCalled()
    expect(flow.deps.registration.corrections).toEqual([])
  })

  it("refuses a link no order answers to", async () => {
    const flow = await refusedByKba()

    await expect(correctApplication(flow.deps, "faketoken-unknown", newVin)).rejects.toBeInstanceOf(TokenInvalid)
    await expect(correctApplication(flow.deps, "", newVin)).rejects.toBeInstanceOf(TokenInvalid)
  })

  it.each(["submitted_to_kba", "completed", "cancelled"] as const)("refuses an order that is %s, and patches nothing", async (target) => {
    const flow = await refusedByKba()
    if (target === "cancelled") await flow.deps.repository.update({ ...(await flow.stored(flow.reference)), status: "cancelled" })
    if (target === "submitted_to_kba") await flow.deps.repository.update({ ...(await flow.stored(flow.reference)), status: "submitted_to_kba" })
    if (target === "completed") await flow.deps.repository.update({ ...(await flow.stored(flow.reference)), status: "completed" })

    await expect(correctApplication(flow.deps, flow.token, newVin)).rejects.toBeInstanceOf(InvalidTransition)

    expect(flow.deps.registration.corrections).toEqual([])
  })

  it("puts no security code in any email or log", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const flow = await refusedByKba()

    await correctApplication(flow.deps, flow.token, newVin)

    const everything = JSON.stringify(flow.deps.mailer.sent) + warn.mock.calls.flat().join(" ") + error.mock.calls.flat().join(" ")
    for (const code of [...CODES, newVin.certificate]) expect(everything).not.toContain(code)
    warn.mockRestore()
    error.mockRestore()
  })
})

describe("correctApplication, against a cancel that got part of the way", () => {
  /** A cancel that moved the money and then failed on the refund email: the order is still at 5b, its money already gone back. */
  async function halfCancelled(flow: Awaited<ReturnType<typeof refusedByKba>>) {
    jest.spyOn(flow.deps.mailer, "send").mockRejectedValueOnce(new Error("Resend is down"))
    await expect(cancelApplication(flow.deps, flow.token)).rejects.toThrow("Resend is down")
    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")
  }

  it.each([
    ["a card that was taken and refunded down to the fee", refusedByKba],
    ["a card held and captured down to the fee", refusedAtSubmission],
  ])("refuses to put an order back at the KBA once its money has gone back: %s", async (_, reach) => {
    const flow = await reach()
    await halfCancelled(flow as Awaited<ReturnType<typeof refusedByKba>>)
    const emailsBefore = flow.emails()

    await expect(correctApplication(flow.deps, flow.token, newVin)).rejects.toBeInstanceOf(PaymentNoLongerWhole)

    expect(flow.deps.registration.corrections).toEqual([])
    expect(flow.deps.registration.submissions.length).toBe(reach === refusedAtSubmission ? 0 : 1)
    expect(flow.emails()).toEqual(emailsBefore)
    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")
  })

  it("leaves the customer able to finish the cancel, which then completes as if nothing had failed", async () => {
    const flow = await refusedByKba()
    await halfCancelled(flow)

    await cancelApplication(flow.deps, flow.token)

    expect((await flow.stored(flow.reference)).status).toBe("cancelled")
    expect(flow.emails().filter((name) => name === "refundIssued")).toHaveLength(1)
  })

  it("still corrects an order whose money is untouched, whatever its state", async () => {
    const flow = await refusedAtSubmission()
    expect((await flow.payment(flow.reference)).status).toBe("held")

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("resubmitted")
  })

  it("refuses an order whose hold lapsed, since resubmitting it would file an order nobody paid for", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const flow = await refusedAtSubmission()
    flow.clock.advance(8 * 24 * 60 * 60 * 1000)

    await expect(correctApplication(flow.deps, flow.token, newVin)).rejects.toBeInstanceOf(PaymentNoLongerWhole)
    warn.mockRestore()
  })
})

describe("correctApplication, against another change made at the same time", () => {
  it("sends nothing to the service when the order changed since it was read, and lets the customer ask again", async () => {
    const flow = await refusedByKba()
    const stale = (await flow.deps.repository.findByStatusToken(flow.token))!
    await flow.deps.repository.update(stale)
    jest.spyOn(flow.deps.repository, "findByStatusToken").mockResolvedValueOnce(stale)

    await expect(correctApplication(flow.deps, flow.token, newVin)).rejects.toBeInstanceOf(StaleApplication)

    expect(flow.deps.registration.corrections).toEqual([])
    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("resubmitted")
    expect(flow.deps.registration.corrections).toHaveLength(1)
  })
})

describe("correctApplication, an order the service refused outright", () => {
  it("files the corrected application under a fresh idempotency key, since the first attempt filed nothing", async () => {
    const flow = await refusedAtSubmission()
    const before = await flow.stored(flow.reference)

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("resubmitted")

    expect(flow.deps.registration.corrections).toEqual([])
    expect(flow.deps.registration.submissions).toHaveLength(1)
    const [submission] = flow.deps.registration.submissions
    expect(submission.request.vin).toBe(newVin.vin)
    expect(submission.idempotencyKey).not.toBe(before.idempotencyKey)
    const after = await flow.stored(flow.reference)
    expect(after.status).toBe("submitted_to_kba")
    expect(after.idempotencyKey).toBe(submission.idempotencyKey)
    expect(after.failure).toBeUndefined()
    expect(flow.emails()).toEqual(["orderConfirmation", "correctionRequired", "submittedToKba"])
  })

  it("says so when the service refuses the corrected data again, and the order is back at 5b with a new email", async () => {
    const flow = await refusedAtSubmission()
    flow.deps.registration.failNext("submit", new GatewayRejected())

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("refused")

    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")
    expect(flow.emails()).toEqual(["orderConfirmation", "correctionRequired", "correctionRequired"])
  })

  it("accepts the correction when the service cannot be reached, leaving the poller to file it", async () => {
    const flow = await refusedAtSubmission()
    flow.deps.registration.failNext("submit", new GatewayUnavailable())

    expect(await correctApplication(flow.deps, flow.token, newVin)).toBe("resubmitted")
    expect((await flow.stored(flow.reference)).status).toBe("submitted_and_paid")
    expect(flow.emails()).toEqual(["orderConfirmation", "correctionRequired"])

    await flow.poll(1)

    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
    expect(flow.emails()).toEqual(["orderConfirmation", "correctionRequired", "submittedToKba"])
  })

  it("gives the second try the full patience of a first, not what the first used up", async () => {
    const flow = await refusedAtSubmission()
    flow.clock.advance(5 * 24 * 60 * 60 * 1000)
    flow.deps.registration.failNext("submit", new GatewayUnavailable())

    await correctApplication(flow.deps, flow.token, newVin)
    await flow.poll(1)

    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
  })
})
