import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW } from "@/tests/fixtures/new-registration"
import { secretsOf } from "@/tests/fixtures/secrets"
import { createRegistrationApplicationSpec, patchRegistrationApplicationSpec, ZULEX_BASE_URL } from "@/tests/fixtures/zulex"
import { ZULEX_TEST_API_KEY, ZulexDouble } from "@/tests/msw/zulex"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import { evbNumberSchema } from "@/src/core/domain/vehicle/evb-number"
import { registrationCertificatePart2Schema } from "@/src/core/domain/vehicle/registration-certificate-part2"
import { vinSchema } from "@/src/core/domain/vehicle/vin"
import { SecurityCode } from "@/src/core/domain/vehicle/security-code"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { registrationGatewayContract } from "@/src/core/ports/registration/registration-gateway.contract"
import { ZulexRegistrationGateway } from "./zulex-registration-gateway"

let zulex = new ZulexDouble()
const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  zulex = new ZulexDouble()
  server.resetHandlers(...zulex.handlers)
})
afterAll(() => server.close())

const gateway = (apiKey = ZULEX_TEST_API_KEY) => new ZulexRegistrationGateway({ baseUrl: ZULEX_BASE_URL, apiKey })

registrationGatewayContract("ZulexRegistrationGateway", () => gateway())

const twoPlates = parseDeregistrationRequest(FAKE_REQUEST)
const onePlate = parseDeregistrationRequest({
  plateCount: 1,
  licencePlate: FAKE_REQUEST.licencePlate,
  vin: FAKE_REQUEST.vin,
  codes: { rearPlate: "AA1", certificate: "AAAAAA1" },
})

const submitted = async () => (await gateway().submit(twoPlates, "key-1")).applicationId

const newRegistrationWith = (overrides: object = {}) =>
  parseNewRegistrationRequest({ ...FAKE_NEW_REGISTRATION, ...overrides }, FAKE_NEW_REGISTRATION_NOW)

const filedNewRegistration = async () => (await gateway().submit(newRegistrationWith(), "key-1")).applicationId

const OWNER_ADDRESS = { street: "Beispielstraße", houseNumber: "12a", zipCode: "10115", city: "Berlin" }

const ECHOED_SECRETS = secretsOf(newRegistrationWith())

describe("ZulexRegistrationGateway", () => {
  describe("a Neuzulassung", () => {
    describe("submit", () => {
      it("sends the spec's body to the registration endpoint, with the API key and the idempotency key", async () => {
        await gateway().submit(newRegistrationWith(), "key-1")

        const [sent] = zulex.requests
        expect(sent).toMatchObject({ method: "POST", path: "/zulex-api/v1/registration-applications" })
        expect(sent.headers.get("X-Api-Key")).toBe(ZULEX_TEST_API_KEY)
        expect(sent.headers.get("X-Idempotency-Key")).toBe("key-1")
        expect(sent.body).toEqual({
          evbNumber: "FAKEEVB",
          ownerInfo: {
            source: "REQUEST_FOR_INDIVIDUAL_PERSON",
            personalInfo: {
              firstName: "Erika",
              lastName: "Mustermann",
              gender: "FEMALE",
              birthDate: "1990-05-17",
              birthPlace: "Musterstadt",
              phoneNumber: "+49 30 23125000",
              email: "erika.mustermann@example.test",
              address: OWNER_ADDRESS,
            },
            deliveryInfo: {
              deliveryType: "SHIPPING",
              deliveryAddress: { firstName: "Erika", lastName: "Mustermann", address: OWNER_ADDRESS },
            },
            sepaInfo: { type: "SEPA", iban: "DE89370400440532013000", bic: "COBADEFFXXX", bankName: "Beispielbank", country: "DE" },
          },
          admissionInfo: {
            admissionType: "STANDARD",
            licencePlateInfo: { licencePlateAttributes: { electricLicencePlate: false, historicLicencePlate: false, seasonalLicencePlate: false } },
          },
          registrationCertificateInfo: { registrationCertificatePart2Number: "FAKE0001", registrationCertificatePart2SecurityCode: "FAKECODE" },
          vehicleInfo: { engineType: "COMBUSTION", vehicleType: "CAR", vehicleUsage: "NORMAL", vin: "FAKEVIN0000000002" },
        })
        expect(createRegistrationApplicationSpec.safeParse(sent.body).success).toBe(true)
      })

      it("asks for an electric, seasonal plate with the months the customer chose", async () => {
        await gateway().submit(
          newRegistrationWith({ engineType: "electric", plate: { electric: true, seasonal: { from: 4, until: 10 } } }),
          "key-1",
        )

        expect(zulex.requests[0].body).toMatchObject({
          vehicleInfo: { engineType: "ELECTRICAL" },
          admissionInfo: {
            licencePlateInfo: {
              licencePlateAttributes: {
                electricLicencePlate: true,
                historicLicencePlate: false,
                seasonalLicencePlate: true,
                seasonalLicencePlateFrom: 4,
                seasonalLicencePlateUntil: 10,
              },
            },
          },
        })
      })

      it.each([
        ["hybrid", "HYBRID"],
        ["combustion", "COMBUSTION"],
        ["electric", "ELECTRICAL"],
      ])("names a %s engine %s, as the spec's enum does", async (engineType, named) => {
        await gateway().submit(newRegistrationWith({ engineType }), "key-1")

        expect(zulex.requests[0].body).toMatchObject({ vehicleInfo: { engineType: named } })
      })

      it.each([
        ["female", "FEMALE"],
        ["male", "MALE"],
        ["diverse", "DIVERSE"],
        ["unspecified", "UNSPECIFIED"],
      ])("names the gender %s %s, as the spec's enum does", async (gender, named) => {
        await gateway().submit(newRegistrationWith({ owner: { ...FAKE_NEW_REGISTRATION.owner, gender } }), "key-1")

        expect(zulex.requests[0].body).toMatchObject({ ownerInfo: { personalInfo: { gender: named } } })
      })

      it("turns a 400 into GatewayRejected", async () => {
        zulex.failNext("create", new HttpResponse(null, { status: 400 }))

        await expect(gateway().submit(newRegistrationWith(), "key-1")).rejects.toBeInstanceOf(GatewayRejected)
      })
    })

    describe("getStatus", () => {
      it("reads the registration endpoint and maps its documents, the confirmation and the temporary certificate among them", async () => {
        const applicationId = await filedNewRegistration()
        zulex.setStatus(applicationId, "FINISHED", {
          documents: [
            { id: "9007199254740993", type: "REGISTRATION_CONFIRMATION" },
            { id: "2", type: "TEMPORARY_REGISTRATION_CERTIFICATE" },
            { id: "3", type: "FEE" },
            { id: "4", type: "REJECTION" },
            { id: "5", type: "DEREGISTRATION_CONFIRMATION" },
          ],
        })

        expect(await gateway().getStatus("newRegistration", applicationId)).toEqual({
          state: "finished",
          documents: [
            { id: "9007199254740993", kind: "confirmation" },
            { id: "2", kind: "temporaryCertificate" },
            { id: "3", kind: "fee" },
            { id: "4", kind: "rejection" },
            { id: "5", kind: "unknown" },
          ],
        })
        expect(zulex.requests.at(-1)).toMatchObject({ method: "GET", path: `/zulex-api/v1/registration-applications/${applicationId}` })
      })

      it("maps ERROR with the KBA's error info", async () => {
        const applicationId = await filedNewRegistration()
        zulex.setStatus(applicationId, "ERROR", { errorInfo: { code: 4711, description: "Fehler", details: ["eVB"] } })

        expect(await gateway().getStatus("newRegistration", applicationId)).toEqual({
          state: "failed",
          error: { code: 4711, description: "Fehler", details: ["eVB"] },
          documents: [],
        })
      })

      it("reads a status tag it does not know as in progress", async () => {
        const applicationId = await filedNewRegistration()
        zulex.setStatus(applicationId, "WAITING_FOR_AUTHORITY")

        expect(await gateway().getStatus("newRegistration", applicationId)).toEqual({ state: "inProgress" })
      })

      it("hands on only the state, the documents and the error of a response that echoes the owner's data", async () => {
        const applicationId = await filedNewRegistration()
        zulex.setStatus(applicationId, "ERROR", { errorInfo: { code: 1 }, documents: [{ id: "8", type: "REJECTION" }] })

        const status = await gateway().getStatus("newRegistration", applicationId)

        const echoed = await (await fetch(`${ZULEX_BASE_URL}/registration-applications/${applicationId}`, { headers: { "X-Api-Key": ZULEX_TEST_API_KEY } })).text()
        for (const secret of ECHOED_SECRETS) expect(echoed).toContain(secret)
        for (const secret of ECHOED_SECRETS) expect(JSON.stringify(status)).not.toContain(secret)
      })

      it("keeps the data a response echoed out of the error when the response cannot be read", async () => {
        const applicationId = await filedNewRegistration()
        server.use(
          http.get(`${ZULEX_BASE_URL}/registration-applications/${applicationId}`, () =>
            HttpResponse.json({ ...(zulex.applications.get(applicationId)!.body as object), applicationId, status: 42, documents: "none" }),
          ),
        )

        const error = await gateway().getStatus("newRegistration", applicationId).catch((caught) => caught)

        expect(error).toBeInstanceOf(Error)
        for (const secret of ECHOED_SECRETS) expect(String(error.message)).not.toContain(secret)
      })
    })

    describe("a response that is not JSON", () => {
      it("keeps what it echoed out of the error", async () => {
        const applicationId = await filedNewRegistration()
        server.use(
          http.get(`${ZULEX_BASE_URL}/registration-applications/${applicationId}`, () =>
            HttpResponse.text(`{"applicationId":"${applicationId}","ownerInfo":{"sepaInfo":{"iban":DE89370400440532013000,`),
          ),
        )

        const error = await gateway().getStatus("newRegistration", applicationId).catch((caught) => caught)

        expect(error).toEqual(new Error("Zulex answered with a body that is not JSON"))
        expect(error.cause).toBeUndefined()
      })
    })

    describe("correct", () => {
      it("patches the changed fields only, under the registration endpoint", async () => {
        const applicationId = await filedNewRegistration()

        await gateway().correct("newRegistration", applicationId, { evbNumber: evbNumberSchema.parse("NEWEVB1"), part2Number: "NEW0002" })

        const sent = zulex.requests.at(-1)!
        expect(sent).toMatchObject({ method: "PATCH", path: `/zulex-api/v1/registration-applications/${applicationId}` })
        expect(sent.body).toEqual({ evbNumber: "NEWEVB1", registrationCertificatePart2Number: "NEW0002" })
        expect(patchRegistrationApplicationSpec.safeParse(sent.body).success).toBe(true)
      })

      it("sends a corrected Teil II code under the name the spec gives it", async () => {
        const applicationId = await filedNewRegistration()

        await gateway().correct("newRegistration", applicationId, { part2SecurityCode: registrationCertificatePart2Schema.parse({ number: "X", securityCode: "NEWCODE" }).securityCode })

        expect(zulex.requests.at(-1)?.body).toEqual({ registrationCertificatePart2SecurityCode: "NEWCODE" })
      })

      it("turns a 400 on a patch into GatewayRejected", async () => {
        const applicationId = await filedNewRegistration()
        zulex.failNext("patch", new HttpResponse(null, { status: 400 }))

        await expect(gateway().correct("newRegistration", applicationId, { part2Number: "NEW0002" })).rejects.toBeInstanceOf(GatewayRejected)
      })
    })
  })

  describe("submit", () => {
    it("sends the spec's body with the API key and the idempotency key", async () => {
      await gateway().submit(twoPlates, "key-1")

      const [sent] = zulex.requests
      expect(sent.headers.get("X-Api-Key")).toBe(ZULEX_TEST_API_KEY)
      expect(sent.headers.get("X-Idempotency-Key")).toBe("key-1")
      expect(sent.body).toEqual({
        licencePlate: { prefix: "AAA", letters: "AA", numbers: "111" },
        vin: "FAKEVIN0000000001",
        rearLicencePlateSecurityCode: "AA1",
        frontLicencePlateSecurityCode: "AA2",
        securityCodeRegistrationCertificationPart1: "AAAAAA1",
        reserveLicencePlate: false,
      })
    })

    it("leaves the front code out for a one-plate vehicle", async () => {
      await gateway().submit(onePlate, "key-1")

      expect(zulex.requests[0].body).not.toHaveProperty("frontLicencePlateSecurityCode")
    })

    it("turns a 400 into GatewayRejected: the same data would fail again", async () => {
      zulex.failNext("create", new HttpResponse(null, { status: 400 }))

      await expect(gateway().submit(twoPlates, "key-1")).rejects.toBeInstanceOf(GatewayRejected)
    })

    it.each([409, 429, 500, 503, 504])("turns a %i into GatewayUnavailable", async (status) => {
      zulex.failNext("create", new HttpResponse(null, { status }))

      await expect(gateway().submit(twoPlates, "key-1")).rejects.toEqual(new GatewayUnavailable())
    })

    it("carries Retry-After, in seconds, as milliseconds", async () => {
      zulex.failNext("create", new HttpResponse(null, { status: 429, headers: { "Retry-After": "120" } }))

      const error = await gateway().submit(twoPlates, "key-1").catch((caught) => caught)

      expect(error).toBeInstanceOf(GatewayUnavailable)
      expect(error.retryAfterMs).toBe(120_000)
    })

    it("turns a network failure into GatewayUnavailable", async () => {
      server.use(http.post(`${ZULEX_BASE_URL}/deregistration-applications`, () => HttpResponse.error()))

      await expect(gateway().submit(twoPlates, "key-1")).rejects.toBeInstanceOf(GatewayUnavailable)
    })

    it("fails loudly on a wrong API key, a configuration error no retry fixes, without echoing the key", async () => {
      const error = await gateway("wrong-key").submit(twoPlates, "key-1").catch((caught) => caught)

      expect(error).not.toBeInstanceOf(GatewayUnavailable)
      expect(error).not.toBeInstanceOf(GatewayRejected)
      expect(error.message).toContain("401")
      expect(error.message).not.toContain("wrong-key")
    })
  })

  describe("getStatus", () => {
    it("maps FINISHED with its documents, keeping int64 ids exact", async () => {
      const applicationId = await submitted()
      zulex.setStatus(applicationId, "FINISHED", {
        documents: [
          { id: "9007199254740993", type: "DEREGISTRATION_CONFIRMATION" },
          { id: "2", type: "FEE" },
          { id: "3", type: "REJECTION" },
          { id: "4", type: "TEMPORARY_REGISTRATION_CERTIFICATE" },
          { id: "5", type: "REGISTRATION_CONFIRMATION" },
        ],
      })

      expect(await gateway().getStatus("deregistration", applicationId)).toEqual({
        state: "finished",
        documents: [
          { id: "9007199254740993", kind: "confirmation" },
          { id: "2", kind: "fee" },
          { id: "3", kind: "rejection" },
          { id: "4", kind: "unknown" },
          { id: "5", kind: "unknown" },
        ],
      })
    })

    it("maps ERROR with the KBA's error info", async () => {
      const applicationId = await submitted()
      zulex.setStatus(applicationId, "ERROR", { errorInfo: { code: 4711, description: "Fehler", details: ["VIN"] } })

      expect(await gateway().getStatus("deregistration", applicationId)).toEqual({
        state: "failed",
        error: { code: 4711, description: "Fehler", details: ["VIN"] },
        documents: [],
      })
    })

    it("reads a status tag it does not know as in progress, as the spec warns new ones arrive", async () => {
      const applicationId = await submitted()
      zulex.setStatus(applicationId, "WAITING_FOR_AUTHORITY")

      expect(await gateway().getStatus("deregistration", applicationId)).toEqual({ state: "inProgress" })
    })
  })

  it("retries a failed application without sending data", async () => {
    const applicationId = await submitted()
    zulex.setStatus(applicationId, "ERROR", { errorInfo: { code: 1 } })

    await gateway().retry(applicationId)

    expect(zulex.requests.at(-1)).toMatchObject({ method: "POST", path: `/zulex-api/v1/applications/${applicationId}/retry` })
    expect(await gateway().getStatus("deregistration", applicationId)).toEqual({ state: "inProgress" })
  })

  it.each([
    ["a de-registration", () => gateway().correct("deregistration", "1", {})],
    ["a Neuzulassung", () => gateway().correct("newRegistration", "1", {})],
  ])("refuses to patch %s with nothing to change, as the KBA would be sent the application again unchanged", async (_, call) => {
    await expect(call()).rejects.toThrow("nothing to correct")

    expect(zulex.requests).toHaveLength(0)
  })

  it("patches only the corrected fields", async () => {
    const applicationId = await submitted()

    await gateway().correct("deregistration", applicationId, {
      vin: vinSchema.parse("FAKEVIN0000000002"),
      codes: { rearPlate: SecurityCode.parse("rearPlate", "AA3") },
    })

    expect(zulex.requests.at(-1)?.body).toEqual({ vin: "FAKEVIN0000000002", rearLicencePlateSecurityCode: "AA3" })
  })

  it("returns a document's bytes", async () => {
    const pdf = new TextEncoder().encode("%PDF-fake")
    zulex.setDocument("9007199254740993", pdf)

    expect(await gateway().fetchDocument("9007199254740993")).toEqual(pdf)
  })

  it("asks for the authorities of a plate prefix", async () => {
    zulex.setAuthorities("AAA", [{ kreiscode: "11111", ikfzStatus: "offline" }])

    expect(await gateway().findAuthorities({ prefix: "AAA" })).toEqual([{ kreiscode: "11111", ikfzStatus: "offline" }])
  })

  it("asks for the authorities of a postcode, where a car is registered by its keeper's address", async () => {
    zulex.setAuthorities("10115", [{ kreiscode: "22222", ikfzStatus: "unavailable" }])

    expect(await gateway().findAuthorities({ postcode: "10115" })).toEqual([{ kreiscode: "22222", ikfzStatus: "unavailable" }])
  })
})
