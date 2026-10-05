import { patchRegistrationApplicationSpec, createRegistrationApplicationSpec } from "@/tests/fixtures/zulex"
import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import type { NewRegistrationApplication } from "@/tests/fixtures/applications"
import { secretsOf } from "@/tests/fixtures/secrets"
import { Secret } from "@/src/core/domain/secret"
import { InvalidTransition } from "@/src/core/errors/application/invalid-transition"
import { PaymentNoLongerWhole } from "@/src/core/errors/payment/payment-no-longer-whole"
import { ValidationError } from "@/src/core/errors/validation-error"
import type { RejectionCatalogue } from "@/src/core/domain/registration/rejection-catalogue"
import { cancelApplication } from "@/src/core/use-cases/application/cancel-application"
import { correctApplication } from "@/src/core/use-cases/application/correct-application"
import { pollDueApplications } from "@/src/core/use-cases/registration/poll-due-applications"
import { submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"
import { HOUR, setupFlow } from "./flow-harness"
import { withVendorsAtTheNetwork } from "./network-harness"

/**
 * N7, 5b for a Neuzulassung (launch plan Q53 and Q47, provisional). Two kinds of 5b, told apart by whether the
 * order's identity was ever verified: one the KBA or Zulex sent back after the identity was confirmed, whose
 * eVB number and Teil II can be corrected, and one the identity check sent back because the person verified is
 * not the owner on the order, whose name and birth date can be corrected and which is then checked again.
 */
const CATALOGUE: RejectionCatalogue = { 101: { class: "correctable", reason: "Die eVB-Nummer wurde nicht akzeptiert." } }
const NEW_EVB = "FAKEEVC"

describe("a Neuzulassung the KBA or Zulex sent back, its identity already verified, at the Zulex network", () => {
  const { world, stored, emails, verifiedNewRegistration } = withVendorsAtTheNetwork()
  const deps = () => ({ ...world.deps, errorCatalogue: CATALOGUE })
  const tokenOf = async (reference: NewRegistrationApplication["reference"]) => (await world.deps.repository.getStatusToken(reference))!

  /** Filed and then refused by the KBA with a code the catalogue calls correctable: 5b, the application held by Zulex. */
  async function refusedByKba() {
    const order = await verifiedNewRegistration()
    await submitToKba(deps(), order)
    const { zulexApplicationId } = await stored(order.reference)
    world.zulex.setStatus(zulexApplicationId!, "ERROR", { errorInfo: { code: 101, details: [] } })
    world.clock.advance(HOUR)
    await pollDueApplications(deps(), 50)
    expect((await stored(order.reference)).status).toBe("failed_correctable")
    return { order, zulexId: zulexApplicationId!, token: await tokenOf(order.reference) }
  }

  /** Refused outright when filed (a 400): Zulex holds nothing, so the correction files the order afresh. */
  async function refusedAtSubmission() {
    const order = await verifiedNewRegistration()
    world.zulex.failNext("create", new Response(null, { status: 400 }))
    await submitToKba(deps(), order)
    expect((await stored(order.reference)).status).toBe("failed_correctable")
    return { order, token: await tokenOf(order.reference) }
  }

  it("patches the eVB number and the Teil II code at the registration endpoint, sending only those, and puts the order back at the KBA", async () => {
    const { order, zulexId, token } = await refusedByKba()

    expect(await correctApplication(deps(), token, { evbNumber: NEW_EVB, part2SecurityCode: "NEWCODE" })).toBe("resubmitted")

    const patches = world.zulex.requests.filter(({ method }) => method === "PATCH")
    expect(patches).toHaveLength(1)
    expect(patches[0].path).toBe(`/zulex-api/v1/registration-applications/${zulexId}`)
    expect(patches[0].body).toEqual({ evbNumber: NEW_EVB, registrationCertificatePart2SecurityCode: "NEWCODE" })
    expect(patchRegistrationApplicationSpec.safeParse(patches[0].body).success).toBe(true)

    const corrected = await stored(order.reference)
    expect(corrected.status).toBe("submitted_to_kba")
    expect(corrected.failure).toBeUndefined()
    expect((corrected as NewRegistrationApplication).request.evbNumber.reveal()).toBe(NEW_EVB)
    expect((corrected as NewRegistrationApplication).request.registrationCertificate.securityCode.reveal()).toBe("NEWCODE")
    expect(emails()).toEqual(["submittedToKba", "correctionRequired", "submittedToKba"])
  })

  it("told the customer in email 5b that the registration service sent the order back, not that an identity check did", async () => {
    await refusedByKba()

    const email = world.mailer.sent.map(({ template }) => template).find((template) => template.name === "correctionRequired")
    expect(email).toMatchObject({ service: "newRegistration", identityMismatch: false })
  })

  it("never sends the owner or the bank account, whatever else the stored order holds", async () => {
    const { token } = await refusedByKba()

    await correctApplication(deps(), token, { part2Number: "FAKE0002" })

    const [patch] = world.zulex.requests.filter(({ method }) => method === "PATCH")
    expect(patch.body).toEqual({ registrationCertificatePart2Number: "FAKE0002" })
  })

  it("is checked at the KBA again after the correction, and can complete", async () => {
    const { order, zulexId, token } = await refusedByKba()
    await correctApplication(deps(), token, { evbNumber: NEW_EVB })
    world.zulex.setStatus(zulexId, "FINISHED", { documents: [] })

    world.clock.advance(HOUR)
    await pollDueApplications(deps(), 50)

    expect((await stored(order.reference)).status).toBe("completed")
  })

  it("leaves the order at 5b, changed in no way, when Zulex refuses the corrected data", async () => {
    const { order, token } = await refusedByKba()
    world.zulex.failNext("patch", new Response(null, { status: 400 }))
    const before = await stored(order.reference)

    expect(await correctApplication(deps(), token, { evbNumber: NEW_EVB })).toBe("refused")

    expect(await stored(order.reference)).toEqual({ ...before, version: expect.any(Number) })
  })

  it("does not patch twice when Zulex already works on the application, which a rerun after a lost save finds", async () => {
    const { order, token } = await refusedByKba()
    const update = world.deps.repository.update.bind(world.deps.repository)
    jest.spyOn(world.deps.repository, "update").mockImplementation(async (application) => {
      if (application.status === "submitted_to_kba") throw new Error("database unreachable")
      return update(application)
    })

    await expect(correctApplication(deps(), token, { evbNumber: NEW_EVB })).rejects.toThrow("database unreachable")
    jest.restoreAllMocks()
    expect(await correctApplication(deps(), token, { evbNumber: NEW_EVB })).toBe("resubmitted")

    expect(world.zulex.requests.filter(({ method }) => method === "PATCH")).toHaveLength(1)
    expect((await stored(order.reference)).status).toBe("submitted_to_kba")
  })

  describe("an application Zulex refused outright when it was filed", () => {
    it("is filed afresh with the corrected eVB under a new idempotency key, back at the KBA", async () => {
      const { order, token } = await refusedAtSubmission()

      expect(await correctApplication(deps(), token, { evbNumber: NEW_EVB })).toBe("resubmitted")

      const creates = world.zulex.requests.filter(({ method }) => method === "POST")
      expect(creates).toHaveLength(2)
      expect(creates[1].headers.get("X-Idempotency-Key")).not.toBe(creates[0].headers.get("X-Idempotency-Key"))
      expect(creates[1].headers.get("X-Idempotency-Key")).toBe((await stored(order.reference)).idempotencyKey)
      expect(createRegistrationApplicationSpec.safeParse(creates[1].body).success).toBe(true)
      expect((creates[1].body as { evbNumber: string }).evbNumber).toBe(NEW_EVB)
      expect(world.zulex.requests.filter(({ method }) => method === "PATCH")).toEqual([])
      expect((await stored(order.reference)).status).toBe("submitted_to_kba")
    })
  })

  it.each([
    ["the owner's first name", { firstName: "Maria" }],
    ["the owner's last name", { lastName: "Musterfrau" }],
    ["the birth date", { birthDate: "1990-05-18" }],
  ])("refuses to change %s, since the person was checked against it and Zulex cannot patch it", async (_, input) => {
    const { order, token } = await refusedByKba()
    const before = await stored(order.reference)

    await expect(correctApplication(deps(), token, { ...input, evbNumber: NEW_EVB })).rejects.toBeInstanceOf(ValidationError)

    expect(world.zulex.requests.filter(({ method }) => method === "PATCH")).toEqual([])
    expect(await stored(order.reference)).toEqual({ ...before, version: expect.any(Number) })
  })

  it("refuses a name change on an order refused at filing too: its identity was verified against the name", async () => {
    const { token } = await refusedAtSubmission()

    await expect(correctApplication(deps(), token, { lastName: "Musterfrau" })).rejects.toBeInstanceOf(ValidationError)

    expect(world.zulex.requests.filter(({ method }) => method === "POST")).toHaveLength(1)
  })

  it("cannot correct the VIN: Zulex's patch does not take it, so a form of only a VIN is an empty one", async () => {
    const { token } = await refusedByKba()

    await expect(correctApplication(deps(), token, { vin: "FAKEVIN0000000009" })).rejects.toMatchObject({ fields: ["correction"] })

    expect(world.zulex.requests.filter(({ method }) => method === "PATCH")).toEqual([])
  })

  it("puts no secret of the order in an email or a log", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const { order, token } = await refusedByKba()

    await correctApplication(deps(), token, { evbNumber: NEW_EVB, part2SecurityCode: "NEWCODE" })

    const everything = JSON.stringify(world.mailer.sent) + warn.mock.calls.flat().join(" ") + error.mock.calls.flat().join(" ")
    for (const secret of [...secretsOf((await stored(order.reference)).request), NEW_EVB, "NEWCODE"]) expect(everything).not.toContain(secret)
    jest.restoreAllMocks()
  })
})

describe("a Neuzulassung the identity check sent back because the person verified is not the owner on the order", () => {
  const another = { firstName: "Erik", lastName: "Mustermann", birthDate: new Secret(FAKE_NEW_REGISTRATION.owner.birthDate, "birth date") }

  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
    jest.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  /** Nothing filed, the card held: the customer typed "Erika", the identity provider found "Erik". */
  async function mismatched() {
    const flow = setupFlow()
    const reference = await flow.checkoutAndPayNewRegistration()
    await flow.customerVerifies(reference, another)
    await flow.poll(1)
    expect((await flow.stored(reference)).status).toBe("failed_correctable")
    return { ...flow, reference, token: (await flow.deps.repository.getStatusToken(reference))! }
  }

  it("takes the corrected name, checks the same verification again at once, and files the order when it now matches", async () => {
    const flow = await mismatched()

    expect(await correctApplication(flow.deps, flow.token, { firstName: "Erik" })).toBe("resubmitted")

    const order = (await flow.stored(flow.reference)) as NewRegistrationApplication
    expect(order.request.owner.firstName).toBe("Erik")
    expect(order.status).toBe("submitted_to_kba")
    expect(order.failure).toBeUndefined()
    expect(order.history.map(({ status }) => status)).toEqual([
      "awaiting_payment",
      "submitted_and_paid",
      "awaiting_identity_verification",
      "failed_correctable",
      "awaiting_identity_verification",
      "identity_verified",
      "submitted_to_kba",
    ])
    expect(flow.deps.registration.submissions).toHaveLength(1)
    expect(flow.emails()).toEqual([
      "orderConfirmation",
      "identityVerificationRequested",
      "correctionRequired",
      "identityVerified",
      "submittedToKba",
    ])
  })

  it("files the corrected name, never the typed one", async () => {
    const flow = await mismatched()

    await correctApplication(flow.deps, flow.token, { firstName: "Erik" })

    const [{ request }] = flow.deps.registration.submissions
    expect(request.service === "newRegistration" && request.owner.firstName).toBe("Erik")
  })

  it("sends the order back to 5b with another email, and files nothing, when the name still does not match", async () => {
    const flow = await mismatched()

    expect(await correctApplication(flow.deps, flow.token, { lastName: "Mustermann-Beispiel" })).toBe("refused")

    const order = await flow.stored(flow.reference)
    expect(order.status).toBe("failed_correctable")
    expect(order.failure).toEqual({ kind: "identityMismatch" })
    expect(flow.deps.registration.submissions).toEqual([])
    expect(flow.emails().filter((name) => name === "correctionRequired")).toHaveLength(2)
    expect(await flow.payment(flow.reference)).toMatchObject({ status: "held" })
  })

  it("can be corrected again after a second mismatch", async () => {
    const flow = await mismatched()
    await correctApplication(flow.deps, flow.token, { lastName: "Mustermann-Beispiel" })

    expect(await correctApplication(flow.deps, flow.token, { lastName: "Mustermann", firstName: "Erik" })).toBe("resubmitted")

    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
  })

  it("corrects the eVB number and the Teil II in the same step, since nothing was filed", async () => {
    const flow = await mismatched()

    await correctApplication(flow.deps, flow.token, { firstName: "Erik", evbNumber: NEW_EVB })

    const [{ request }] = flow.deps.registration.submissions
    expect(request.service === "newRegistration" && request.evbNumber.reveal()).toBe(NEW_EVB)
    expect(flow.deps.registration.patches).toEqual([])
  })

  it("keeps the order at status 2, due at once, when the identity provider cannot be asked, for the poller to finish", async () => {
    const flow = await mismatched()
    jest.spyOn(flow.deps.identity, "getResult").mockRejectedValueOnce(new Error("the provider is down"))

    expect(await correctApplication(flow.deps, flow.token, { firstName: "Erik" })).toBe("resubmitted")

    const waiting = await flow.stored(flow.reference)
    expect(waiting.status).toBe("awaiting_identity_verification")
    expect(waiting.polling.nextPollAt!.getTime()).toBeLessThanOrEqual(flow.clock.now().getTime())
    expect(flow.deps.registration.submissions).toEqual([])

    await flow.poll(1)

    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
  })

  it("asks again for a birth date under 18 or an empty form, and leaves the order at 5b", async () => {
    const flow = await mismatched()

    await expect(correctApplication(flow.deps, flow.token, { birthDate: "2020-01-01" })).rejects.toBeInstanceOf(ValidationError)
    await expect(correctApplication(flow.deps, flow.token, {})).rejects.toMatchObject({ fields: ["correction"] })

    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")
  })

  it("still files the order when the customer corrects it long after the verification deadline and the card hold would have lapsed, the money kept whole by the daily look at 5b", async () => {
    const flow = await mismatched()

    for (let day = 0; day < 9; day++) await flow.poll(24 * 60)
    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")

    expect(await correctApplication(flow.deps, flow.token, { firstName: "Erik" })).toBe("resubmitted")

    expect((await flow.stored(flow.reference)).status).toBe("submitted_to_kba")
    expect(flow.deps.registration.submissions).toHaveLength(1)
    expect(await flow.payment(flow.reference)).toMatchObject({ status: "captured" })
  })

  it("never reaches Zulex for an order whose identity was never verified, whatever the customer corrects", async () => {
    const flow = await mismatched()
    const reached = [jest.spyOn(flow.deps.registration, "submit"), jest.spyOn(flow.deps.registration, "correct"), jest.spyOn(flow.deps.registration, "getStatus")]

    await correctApplication(flow.deps, flow.token, { lastName: "Mustermann-Beispiel", evbNumber: NEW_EVB })

    for (const call of reached) expect(call).not.toHaveBeenCalled()
  })

  it("refuses an order that is not at 5b, and an unknown link, before anything moves", async () => {
    const flow = setupFlow()
    const waiting = await flow.checkoutAndPayNewRegistration()
    const token = (await flow.deps.repository.getStatusToken(waiting))!
    const getPayment = jest.spyOn(flow.deps.payments, "getPayment")

    await expect(correctApplication(flow.deps, token, { firstName: "Erik" })).rejects.toBeInstanceOf(InvalidTransition)

    expect(getPayment).not.toHaveBeenCalled()
    expect((await flow.stored(waiting)).status).toBe("awaiting_identity_verification")
  })

  it("refuses once part of the money has gone back, as for any 5b", async () => {
    const flow = await mismatched()
    jest.spyOn(flow.deps.mailer, "send").mockRejectedValueOnce(new Error("Resend is down"))
    await expect(cancelApplication(flow.deps, flow.token)).rejects.toThrow("Resend is down")

    await expect(correctApplication(flow.deps, flow.token, { firstName: "Erik" })).rejects.toBeInstanceOf(PaymentNoLongerWhole)

    expect(flow.deps.registration.submissions).toEqual([])
  })

  it("puts neither the typed name nor the verified one in an email or a log", async () => {
    const flow = await mismatched()
    const error = jest.spyOn(console, "error")

    await correctApplication(flow.deps, flow.token, { firstName: "Erik" })

    const everything = JSON.stringify(flow.deps.mailer.sent) + error.mock.calls.flat().join(" ")
    for (const secret of secretsOf((await flow.stored(flow.reference)).request)) expect(everything).not.toContain(secret)
  })

  it("is not polled into filing while at 5b: the customer's correction is the only way on", async () => {
    const flow = await mismatched()

    for (let day = 0; day < 3; day++) await flow.poll(24 * 60)

    expect((await flow.stored(flow.reference)).status).toBe("failed_correctable")
    expect(flow.deps.registration.submissions).toEqual([])
  })
})
