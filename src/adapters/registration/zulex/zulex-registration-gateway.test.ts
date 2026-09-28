import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { ZULEX_BASE_URL } from "@/tests/fixtures/zulex"
import { ZULEX_TEST_API_KEY, ZulexDouble } from "@/tests/msw/zulex"
import { parseDeregistrationRequest } from "@/src/core/domain/deregistration-request"
import { parseVin } from "@/src/core/domain/vin"
import { SecurityCode } from "@/src/core/domain/security-code"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/gateway-unavailable"
import { registrationGatewayContract } from "@/src/core/ports/registration-gateway.contract"
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

const submitted = async () => (await gateway().submitDeregistration(twoPlates, "key-1")).applicationId

describe("ZulexRegistrationGateway", () => {
  describe("submitDeregistration", () => {
    it("sends the spec's body with the API key and the idempotency key", async () => {
      await gateway().submitDeregistration(twoPlates, "key-1")

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
      await gateway().submitDeregistration(onePlate, "key-1")

      expect(zulex.requests[0].body).not.toHaveProperty("frontLicencePlateSecurityCode")
    })

    it("turns a 400 into GatewayRejected: the same data would fail again", async () => {
      zulex.failNext("create", new HttpResponse(null, { status: 400 }))

      await expect(gateway().submitDeregistration(twoPlates, "key-1")).rejects.toBeInstanceOf(GatewayRejected)
    })

    it.each([409, 429, 500, 503, 504])("turns a %i into GatewayUnavailable", async (status) => {
      zulex.failNext("create", new HttpResponse(null, { status }))

      await expect(gateway().submitDeregistration(twoPlates, "key-1")).rejects.toEqual(new GatewayUnavailable())
    })

    it("carries Retry-After, in seconds, as milliseconds", async () => {
      zulex.failNext("create", new HttpResponse(null, { status: 429, headers: { "Retry-After": "120" } }))

      const error = await gateway().submitDeregistration(twoPlates, "key-1").catch((caught) => caught)

      expect(error).toBeInstanceOf(GatewayUnavailable)
      expect(error.retryAfterMs).toBe(120_000)
    })

    it("turns a network failure into GatewayUnavailable", async () => {
      server.use(http.post(`${ZULEX_BASE_URL}/deregistration-applications`, () => HttpResponse.error()))

      await expect(gateway().submitDeregistration(twoPlates, "key-1")).rejects.toBeInstanceOf(GatewayUnavailable)
    })

    it("fails loudly on a wrong API key, a configuration error no retry fixes, without echoing the key", async () => {
      const error = await gateway("wrong-key").submitDeregistration(twoPlates, "key-1").catch((caught) => caught)

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
        ],
      })

      expect(await gateway().getStatus(applicationId)).toEqual({
        state: "finished",
        documents: [
          { id: "9007199254740993", kind: "confirmation" },
          { id: "2", kind: "fee" },
          { id: "3", kind: "rejection" },
          { id: "4", kind: "unknown" },
        ],
      })
    })

    it("maps ERROR with the KBA's error info", async () => {
      const applicationId = await submitted()
      zulex.setStatus(applicationId, "ERROR", { errorInfo: { code: 4711, description: "Fehler", details: ["VIN"] } })

      expect(await gateway().getStatus(applicationId)).toEqual({
        state: "failed",
        error: { code: 4711, description: "Fehler", details: ["VIN"] },
        documents: [],
      })
    })

    it("reads a status tag it does not know as in progress, as the spec warns new ones arrive", async () => {
      const applicationId = await submitted()
      zulex.setStatus(applicationId, "WAITING_FOR_AUTHORITY")

      expect(await gateway().getStatus(applicationId)).toEqual({ state: "inProgress" })
    })
  })

  it("retries a failed application without sending data", async () => {
    const applicationId = await submitted()
    zulex.setStatus(applicationId, "ERROR", { errorInfo: { code: 1 } })

    await gateway().retry(applicationId)

    expect(zulex.requests.at(-1)).toMatchObject({ method: "POST", path: `/zulex-api/v1/applications/${applicationId}/retry` })
    expect(await gateway().getStatus(applicationId)).toEqual({ state: "inProgress" })
  })

  it("patches only the corrected fields", async () => {
    const applicationId = await submitted()

    await gateway().correct(applicationId, {
      vin: parseVin("FAKEVIN0000000002"),
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

    expect(await gateway().findAuthorities("AAA")).toEqual([{ kreiscode: "11111", ikfzStatus: "offline" }])
  })
})
