import { setupServer } from "msw/node"
import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW } from "@/tests/fixtures/new-registration"
import { ZULEX_BASE_URL } from "@/tests/fixtures/zulex"
import { ZULEX_TEST_API_KEY, ZulexDouble } from "@/tests/msw/zulex"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import { createBody } from "@/src/adapters/registration/zulex/request-bodies"

const server = setupServer()
let zulex = new ZulexDouble()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  zulex = new ZulexDouble()
  server.resetHandlers(...zulex.handlers)
})
afterAll(() => server.close())

const call = (method: string, path: string, body?: unknown) =>
  fetch(`${ZULEX_BASE_URL}${path}`, {
    method,
    headers: { "X-Api-Key": ZULEX_TEST_API_KEY, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const registration = createBody(parseNewRegistrationRequest(FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW))
const deregistration = createBody(parseDeregistrationRequest(FAKE_REQUEST))

describe("ZulexDouble", () => {
  it("files a registration the spec accepts", async () => {
    const response = await call("POST", "/registration-applications", registration)

    expect(response.status).toBe(201)
    expect(zulex.applications.size).toBe(1)
  })

  it("refuses a registration the spec does not accept, and files nothing", async () => {
    const response = await call("POST", "/registration-applications", { ...registration, registered: true })

    expect(response.status).toBe(400)
    expect(zulex.applications.size).toBe(0)
  })

  it("refuses a patch the spec does not accept, and leaves the application as it was", async () => {
    const { applicationId } = await (await call("POST", "/registration-applications", registration)).json()

    const response = await call("PATCH", `/registration-applications/${applicationId}`, { vin: "FAKEVIN0000000009" })

    expect(response.status).toBe(400)
    expect(zulex.applications.get(applicationId)?.body).toEqual(registration)
  })

  describe("an application asked after at another service's endpoint", () => {
    it.each([
      ["GET", undefined],
      ["PATCH", {}],
    ])("answers %s with a 404, as an id of another service is unknown there", async (method, body) => {
      const { applicationId } = await (await call("POST", "/deregistration-applications", deregistration)).json()

      expect((await call(method, `/registration-applications/${applicationId}`, body)).status).toBe(404)
      expect((await call("GET", `/deregistration-applications/${applicationId}`)).status).toBe(200)
    })

    it("answers a registration read at the de-registration endpoint with a 404", async () => {
      const { applicationId } = await (await call("POST", "/registration-applications", registration)).json()

      expect((await call("GET", `/deregistration-applications/${applicationId}`)).status).toBe(404)
    })
  })
})
