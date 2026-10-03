import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { parseVin } from "@/src/core/domain/vehicle/vin"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { registrationGatewayContract } from "@/src/core/ports/registration/registration-gateway.contract"
import { FakeRegistrationGateway } from "./fake-registration-gateway"

registrationGatewayContract("FakeRegistrationGateway", () => new FakeRegistrationGateway())

const request = parseDeregistrationRequest(FAKE_REQUEST)

describe("FakeRegistrationGateway on staging, where each Vercel instance holds its own fake", () => {
  it("gives orders filed on different instances different ids", async () => {
    const first = await new FakeRegistrationGateway().submitDeregistration(request, "order-a")
    const second = await new FakeRegistrationGateway().submitDeregistration(request, "order-b")

    expect(first.applicationId).not.toEqual(second.applicationId)
  })

  it("answers a submission retried on another instance with the id it already has", async () => {
    const instanceA = new FakeRegistrationGateway()
    await instanceA.submitDeregistration(request, "order-a")
    const filed = await instanceA.submitDeregistration(request, "order-b")

    const retried = await new FakeRegistrationGateway().submitDeregistration(request, "order-b")

    expect(retried).toEqual(filed)
  })

  it("reports an application another instance filed as in progress", async () => {
    const { applicationId } = await new FakeRegistrationGateway().submitDeregistration(request, "order-a")

    expect(await new FakeRegistrationGateway().getStatus(applicationId)).toEqual({ state: "inProgress" })
  })
})

describe("FakeRegistrationGateway scripting, which the use-case tests rely on", () => {
  let gateway: FakeRegistrationGateway
  let applicationId: string
  beforeEach(async () => {
    gateway = new FakeRegistrationGateway()
    ;({ applicationId } = await gateway.submitDeregistration(request, "key"))
  })

  it("reports the status a test sets", async () => {
    const failed = { state: "failed", error: { code: 4711, details: [] }, documents: [] } as const

    gateway.setStatus(applicationId, failed)

    expect(await gateway.getStatus(applicationId)).toEqual(failed)
  })

  it("fails only the next call of the named operation, then recovers", async () => {
    gateway.failNext("getStatus", new GatewayUnavailable(30_000))

    await expect(gateway.getStatus(applicationId)).rejects.toEqual(new GatewayUnavailable(30_000))
    await expect(gateway.retry(applicationId)).resolves.toBeUndefined()
    await expect(gateway.getStatus(applicationId)).resolves.toEqual({ state: "inProgress" })
  })

  it("files nothing when a submission is scripted to be rejected", async () => {
    gateway.failNext("submit", new GatewayRejected())

    await expect(gateway.submitDeregistration(request, "rejected-key")).rejects.toBeInstanceOf(GatewayRejected)
    expect(gateway.submissions).toHaveLength(1)
  })

  it("records retries and corrections, and puts the application back in progress", async () => {
    gateway.setStatus(applicationId, { state: "failed", error: { code: 1, details: [] }, documents: [] })
    const correction = { vin: parseVin("FAKEVIN0000000002") }

    await gateway.retry(applicationId)
    await gateway.correct(applicationId, correction)

    expect(gateway.retries).toEqual([applicationId])
    expect(gateway.corrections).toEqual([{ applicationId, correction }])
    expect(await gateway.getStatus(applicationId)).toEqual({ state: "inProgress" })
  })

  it("serves the bytes of a document a test sets", async () => {
    const pdf = new TextEncoder().encode("%PDF-fake")

    gateway.setDocument("9007199254740993", pdf)

    expect(await gateway.fetchDocument("9007199254740993")).toEqual(pdf)
  })

  it("answers with the authorities a test sets, online by default", async () => {
    expect(await gateway.findAuthorities("AAA")).toEqual([{ kreiscode: "00000", ikfzStatus: "online" }])

    gateway.setAuthorities("BBB", [{ kreiscode: "11111", ikfzStatus: "offline" }])

    expect(await gateway.findAuthorities("BBB")).toEqual([{ kreiscode: "11111", ikfzStatus: "offline" }])
  })
})
