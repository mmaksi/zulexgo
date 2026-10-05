import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import { secretsOf } from "@/tests/fixtures/secrets"
import { CODES, setupFlow } from "@/tests/integration/flow-harness"
import { Secret } from "@/src/core/domain/secret"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { cancelOrder, correctOrder } from "./order-change"

const headers = new Headers({ "x-forwarded-for": "203.0.113.7" })

async function correctableOrder() {
  const flow = setupFlow()
  flow.deps.registration.failNext("submit", new GatewayRejected())
  const reference = await flow.checkoutAndPay("card")
  return { ...flow, reference, token: (await flow.deps.repository.getStatusToken(reference))! }
}

describe("cancelOrder", () => {
  it("cancels an order that waits for a correction", async () => {
    const { deps, stored, reference, token } = await correctableOrder()

    expect(await cancelOrder(deps, headers, token)).toEqual({ status: "done" })
    expect((await stored(reference)).status).toBe("cancelled")
  })

  it("does nothing more when asked again for an order it already cancelled", async () => {
    const { deps, token, payment, reference } = await correctableOrder()
    await cancelOrder(deps, headers, token)
    const after = await payment(reference)

    expect(await cancelOrder(deps, headers, token)).toEqual({ status: "done" })
    expect(await payment(reference)).toEqual(after)
  })

  it("answers alike for a link that opens nothing and for an order that cannot be cancelled, so it tells nothing about either", async () => {
    const flow = setupFlow()
    const reference = await flow.checkoutAndPay("card")

    expect(await cancelOrder(flow.deps, headers, "faketoken-unknown")).toEqual({ status: "notPossible" })
    expect(await cancelOrder(flow.deps, headers, (await flow.deps.repository.getStatusToken(reference))!)).toEqual({ status: "notPossible" })
  })

  it("counts every attempt, right link or wrong, against the caller's address, and moves no money once over the limit", async () => {
    const { deps, payment, stored, reference, token } = await correctableOrder()
    for (let attempt = 0; attempt < RATE_LIMITS.orderChange.max; attempt++) await cancelOrder(deps, headers, "faketoken-guess")

    const result = await cancelOrder(deps, headers, token)

    expect(result).toMatchObject({ status: "limited", retryAfterMinutes: expect.any(Number) })
    expect((await stored(reference)).status).toBe("failed_correctable")
    expect((await payment(reference)).status).toBe("held")
  })

  it("tells the customer to try again when the money or the email fails, logging the kind of error and never its message", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const { deps, stored, reference, token } = await correctableOrder()
    jest.spyOn(deps.mailer, "send").mockRejectedValue(new Error("Resend refused customer@example.test"))

    expect(await cancelOrder(deps, headers, token)).toEqual({ status: "failed" })

    expect((await stored(reference)).status).toBe("failed_correctable")
    const logged = error.mock.calls.flat().join(" ")
    expect(logged).toContain("Error")
    expect(logged).not.toContain("customer@example.test")
    for (const code of CODES) expect(logged).not.toContain(code)
    error.mockRestore()
  })
})

const fix = { vin: "FAKEVIN0000000009", certificate: "AAAAAA9" }

async function correctableAtTheKba() {
  const flow = setupFlow()
  const reference = await flow.checkoutAndPay("card")
  flow.deps.registration.setStatus(await flow.zulexId(reference), { state: "failed", error: { code: 101, details: [] }, documents: [] })
  await flow.poll(1)
  return { ...flow, reference, token: (await flow.deps.repository.getStatusToken(reference))! }
}

describe("correctOrder", () => {
  it("corrects an order that waits for it and puts it back at the KBA", async () => {
    const { deps, stored, reference, token } = await correctableAtTheKba()

    expect(await correctOrder(deps, headers, token, fix)).toEqual({ status: "done" })
    expect((await stored(reference)).status).toBe("submitted_to_kba")
  })

  it("names each wrong field in the funnel's own words, and never echoes a value", async () => {
    const { deps, token } = await correctableAtTheKba()

    const result = await correctOrder(deps, headers, token, { vin: "not a vin!", rearPlate: "AAAA", certificate: "AAAAAA9" })

    expect(result).toMatchObject({ status: "invalid", errors: { vin: expect.any(String), rearPlate: expect.any(String) } })
    expect(JSON.stringify(result)).not.toMatch(/not a vin|AAAA|AAAAAA9/)
    expect(result).not.toMatchObject({ errors: { certificate: expect.anything() } })
  })

  it("asks for at least one change, in a sentence for the whole form", async () => {
    const { deps, token } = await correctableAtTheKba()

    expect(await correctOrder(deps, headers, token, {})).toMatchObject({ status: "invalid", errors: {}, general: expect.any(String) })
  })

  it("ignores anything but text in the fields, since any POST can reach it", async () => {
    const { deps, stored, reference, token } = await correctableAtTheKba()

    const result = await correctOrder(deps, headers, token, { vin: 12345, certificate: { toString: "x" }, rearPlate: null } as never)

    expect(result).toMatchObject({ status: "invalid" })
    expect((await stored(reference)).status).toBe("failed_correctable")
  })

  it("tells the customer when the service refuses the corrected data", async () => {
    const { deps, token } = await correctableAtTheKba()
    jest.spyOn(deps.registration, "correct").mockRejectedValueOnce(new GatewayRejected())

    expect(await correctOrder(deps, headers, token, fix)).toEqual({ status: "refused" })
  })

  it("tells the customer to try later when the service cannot be reached, leaving the order at 5b", async () => {
    const { deps, stored, reference, token } = await correctableAtTheKba()
    deps.registration.failNext("correct", new GatewayUnavailable())

    expect(await correctOrder(deps, headers, token, fix)).toEqual({ status: "unavailable" })
    expect((await stored(reference)).status).toBe("failed_correctable")
  })

  it("says it is not possible, changing nothing, once the order's money has already gone back", async () => {
    const { deps, stored, reference, token } = await correctableAtTheKba()
    jest.spyOn(deps.mailer, "send").mockRejectedValueOnce(new Error("Resend is down"))
    expect(await cancelOrder(deps, headers, token)).toEqual({ status: "failed" })
    const correct = jest.spyOn(deps.registration, "correct")

    expect(await correctOrder(deps, headers, token, fix)).toEqual({ status: "notPossible" })

    expect(correct).not.toHaveBeenCalled()
    expect((await stored(reference)).status).toBe("failed_correctable")
  })

  it("answers alike for a link that opens nothing and for an order that cannot be corrected", async () => {
    const flow = setupFlow()
    const reference = await flow.checkoutAndPay("card")

    expect(await correctOrder(flow.deps, headers, "faketoken-unknown", fix)).toEqual({ status: "notPossible" })
    expect(await correctOrder(flow.deps, headers, (await flow.deps.repository.getStatusToken(reference))!, fix)).toEqual({ status: "notPossible" })
  })

  it("shares its limit with cancelling, counts wrong links, and reaches the service no more once over it", async () => {
    const { deps, token } = await correctableAtTheKba()
    const correct = jest.spyOn(deps.registration, "correct")
    for (let attempt = 0; attempt < RATE_LIMITS.orderChange.max; attempt++) await correctOrder(deps, headers, "faketoken-guess", fix)

    expect(await correctOrder(deps, headers, token, fix)).toMatchObject({ status: "limited", retryAfterMinutes: expect.any(Number) })
    expect(correct).not.toHaveBeenCalled()
  })

  it("logs a failure by kind, never its message or a code", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const { deps, token } = await correctableAtTheKba()
    jest.spyOn(deps.registration, "correct").mockRejectedValue(new Error("Zulex refused customer@example.test AAAAAA9"))

    expect(await correctOrder(deps, headers, token, fix)).toEqual({ status: "failed" })

    const logged = error.mock.calls.flat().join(" ")
    expect(logged).toContain("Error")
    for (const secret of ["customer@example.test", "AAAAAA9", ...CODES]) expect(logged).not.toContain(secret)
    error.mockRestore()
  })
})

/** A Neuzulassung the identity check sent back: the customer typed "Erika", the provider found "Erik". Nothing is filed. */
async function mismatchedNewRegistration() {
  const flow = setupFlow()
  const reference = await flow.checkoutAndPayNewRegistration()
  await flow.customerVerifies(reference, { firstName: "Erik", lastName: "Mustermann", birthDate: new Secret(FAKE_NEW_REGISTRATION.owner.birthDate, "birth date") })
  await flow.poll(1)
  return { ...flow, reference, token: (await flow.deps.repository.getStatusToken(reference))! }
}

describe("correctOrder, for a Neuzulassung", () => {
  it("corrects the name the identity check did not accept, and the order goes on to the KBA", async () => {
    const { deps, stored, reference, token } = await mismatchedNewRegistration()

    expect(await correctOrder(deps, headers, token, { firstName: "Erik" })).toEqual({ status: "done" })

    expect((await stored(reference)).status).toBe("submitted_to_kba")
  })

  it("tells the customer the order was refused when the name still does not match", async () => {
    const { deps, stored, reference, token } = await mismatchedNewRegistration()

    expect(await correctOrder(deps, headers, token, { lastName: "Beispiel" })).toEqual({ status: "refused" })

    expect((await stored(reference)).status).toBe("failed_correctable")
  })

  it("names each wrong field in the funnel's own words, and never echoes a value", async () => {
    const { deps, token } = await mismatchedNewRegistration()

    const result = await correctOrder(deps, headers, token, { evbNumber: "FAKEEVI", part2Number: "A".repeat(21), part2SecurityCode: "NEWCODE", birthDate: "2020-01-01" })

    expect(result).toMatchObject({ status: "invalid", errors: { evbNumber: expect.any(String), part2Number: expect.any(String), birthDate: expect.any(String) } })
    expect(JSON.stringify(result)).not.toMatch(/FAKEEVI|AAAAAAAAAAAAAAAAAAAAA|NEWCODE|2020-01-01/)
    expect(result).not.toMatchObject({ errors: { part2SecurityCode: expect.anything() } })
  })

  it("asks for at least one change, in a sentence for the whole form", async () => {
    const { deps, token } = await mismatchedNewRegistration()

    expect(await correctOrder(deps, headers, token, {})).toMatchObject({ status: "invalid", errors: {}, general: expect.any(String) })
  })

  it("ignores anything but text in the fields, since any POST can reach it", async () => {
    const { deps, stored, reference, token } = await mismatchedNewRegistration()

    const result = await correctOrder(deps, headers, token, { evbNumber: 1234567, firstName: { toString: "x" }, birthDate: null } as never)

    expect(result).toMatchObject({ status: "invalid" })
    expect((await stored(reference)).status).toBe("failed_correctable")
  })

  it("logs a failure by kind, never its message or anything the customer typed", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    const { deps, stored, reference, token } = await mismatchedNewRegistration()
    jest.spyOn(deps.repository, "update").mockRejectedValue(new Error("Postgres refused Erik FAKEEVC"))

    expect(await correctOrder(deps, headers, token, { firstName: "Erik", evbNumber: "FAKEEVC" })).toEqual({ status: "failed" })

    const logged = error.mock.calls.flat().join(" ")
    expect(logged).toContain("Error")
    for (const secret of [...secretsOf((await stored(reference)).request), "FAKEEVC"]) expect(logged).not.toContain(secret)
    error.mockRestore()
  })
})
