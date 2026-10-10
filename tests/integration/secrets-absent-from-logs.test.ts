import { HttpResponse } from "msw"
import { FAKE_CONSENTS, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import { secretsOf } from "@/tests/fixtures/secrets"
import { ZULEX_TEST_API_KEY } from "@/tests/msw/zulex"
import { Secret } from "@/src/core/domain/secret"
import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { setupFlow } from "./flow-harness"
import { FakeIdentityVerification } from "@/src/adapters/identity/fake/fake-identity-verification"
import { ConsoleMailer } from "@/src/adapters/mail/console/console-mailer"
import { FakePaymentProvider } from "@/src/adapters/payment/fake/fake-payment-provider"
import { FakeRegistrationGateway } from "@/src/adapters/registration/fake/fake-registration-gateway"
import { InMemoryRateLimiter } from "@/src/adapters/rate-limit/fake/in-memory-rate-limiter"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { FakeTokenGenerator } from "@/src/adapters/tokens/fake/fake-token-generator"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"
import { pollDueApplications } from "@/src/core/use-cases/registration/poll-due-applications"
import { submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"
import { resendStatusLink } from "@/src/core/use-cases/status/resend-status-link"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"
import { withVendorsAtTheNetwork } from "./network-harness"

const CODES = Object.values(FAKE_REQUEST.codes)
const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const

function captureConsole() {
  const lines: string[] = []
  const spies = CONSOLE_METHODS.map((method) =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(" "))
    }),
  )
  return { output: () => lines.join("\n"), restore: () => spies.forEach((spy) => spy.mockRestore()) }
}

async function runEveryPath(revealStatusLinks: boolean): Promise<string[]> {
  const clock = new FakeClock(new Date("2026-03-01T09:00:00.000Z"))
  const deps = {
    repository: new InMemoryApplicationRepository(),
    registration: new FakeRegistrationGateway(),
    payments: new FakePaymentProvider(clock),
    identity: new FakeIdentityVerification(),
    mailer: new ConsoleMailer({ revealStatusLinks }),
    documents: new InMemoryDocumentStore(),
    rateLimiter: new InMemoryRateLimiter(clock),
    clock,
    tokens: new FakeTokenGenerator(),
    statusLink: (token: string) => `https://zulexgo.example.test/status/${token}`,
    errorCatalogue: { 202: { class: "final" as const, reason: "Das Fahrzeug ist bereits abgemeldet." } },
    servicesOnSale: ["deregistration"] as const,
  }
  const poll = (minutes: number) => {
    clock.advance(minutes * 60_000)
    return pollDueApplications(deps, 50)
  }
  const checkoutAndPay = async () => {
    const { reference } = await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test", consents: FAKE_CONSENTS })
    await deps.payments.customerPays((await deps.repository.get(reference))!.payment.id)
    await confirmPayment(deps, reference)
    return reference
  }
  const zulexId = async (reference: Awaited<ReturnType<typeof checkoutAndPay>>) =>
    (await deps.repository.get(reference))!.zulexApplicationId!

  deps.registration.failNext("submit", new GatewayUnavailable())
  const completed = await checkoutAndPay()
  await poll(1)
  deps.registration.setStatus(await zulexId(completed), { state: "finished", documents: [] })
  await poll(2)

  const rejected = await checkoutAndPay()
  deps.registration.setStatus(await zulexId(rejected), { state: "failed", error: { code: 202, details: [] }, documents: [] })
  await poll(5)
  await resendStatusLink(deps, { reference: completed, email: "customer@example.test" })

  const badCodes = { ...FAKE_REQUEST, codes: { ...FAKE_REQUEST.codes, certificate: `${FAKE_REQUEST.codes.certificate}X` } }
  await submitCheckout(deps, { service: "deregistration", request: badCodes, email: "customer@example.test", consents: FAKE_CONSENTS }).catch((error) => console.error(error))

  return Promise.all([completed, rejected].map(async (reference) => (await deps.repository.getStatusToken(reference))!))
}

describe("secrets in logs", () => {
  it.each([
    ["dev", true],
    ["staging and production", false],
  ])("never logs a security code (%s)", async (_, revealStatusLinks) => {
    const console = captureConsole()
    await runEveryPath(revealStatusLinks)
    console.restore()

    expect(console.output()).toContain("[mail]")
    for (const code of CODES) expect(console.output()).not.toContain(code)
  })

  it("keeps status tokens out of the log outside dev", async () => {
    const console = captureConsole()
    const tokens = await runEveryPath(false)
    console.restore()

    for (const token of tokens) expect(console.output()).not.toContain(token)
  })

  it("prints the status link in dev, where it is the only way to open the status page", async () => {
    const console = captureConsole()
    const tokens = await runEveryPath(true)
    console.restore()

    for (const token of tokens) expect(console.output()).toContain(token)
  })
})

describe("a Neuzulassung's secrets in logs", () => {
  const { world, stored, verifiedNewRegistration } = withVendorsAtTheNetwork()
  const HOUR = 60 * 60_000
  const poll = async () => {
    world.clock.advance(HOUR)
    await pollDueApplications(world.deps, 50)
  }

  async function runEveryPath(): Promise<string[]> {
    const order = await verifiedNewRegistration()
    const secrets = secretsOf(order.request)

    world.zulex.failNext("create", new Response(null, { status: 503 }))
    await submitToKba(world.deps, order)
    await poll()
    const id = (await stored(order.reference)).zulexApplicationId!

    world.zulex.failNext("get", HttpResponse.json({ ...(world.zulex.applications.get(id)!.body as object), applicationId: id, status: 42 }))
    await poll()

    const { registrationCertificate, bankAccount } = FAKE_NEW_REGISTRATION
    const error = {
      code: 9999,
      description: `Teil II ${registrationCertificate.securityCode} passt nicht`,
      details: [`IBAN ${bankAccount.iban}`],
    }
    world.zulex.setStatus(id, "ERROR", { errorInfo: error })
    await poll()
    world.zulex.setStatus(id, "ERROR", { errorInfo: error })
    await poll()

    world.zulex.failNext("create", new Response(null, { status: 400 }))
    await submitToKba(world.deps, await verifiedNewRegistration())
    return secrets
  }

  it("never logs what the customer entered, nor what the API echoed or quoted back", async () => {
    const console = captureConsole()
    const secrets = await runEveryPath()
    console.restore()

    expect(console.output()).toContain("[poll]")
    expect(console.output()).toContain("[error-algorithm]")
    for (const secret of secrets) expect(console.output()).not.toContain(secret)
    expect(console.output()).not.toContain(ZULEX_TEST_API_KEY)
  })
})

describe("an identity verification's secrets in logs", () => {
  const verifiedAs = (firstName: string, lastName: string, birthDate: string) => ({ firstName, lastName, birthDate: new Secret(birthDate, "birth date") })

  async function runEveryPath() {
    const flow = setupFlow()
    const deps = { ...flow.deps, mailer: new ConsoleMailer({ revealStatusLinks: false }) }
    const tick = (minutes: number) => {
      flow.clock.advance(minutes * 60_000)
      return pollDueApplications(deps, 50)
    }
    const order = async () => {
      const reference = await flow.payForNewRegistration()
      await confirmPayment(deps, reference)
      return reference
    }

    const filed = await order()
    await flow.customerVerifies(filed)
    await tick(1)

    const failed = await order()
    await flow.customerFailsVerification(failed)
    await tick(1)

    const mismatched = await order()
    await flow.customerVerifies(mismatched, verifiedAs("Erik", "Beispiel", "1991-01-01"))
    await tick(1)

    await order()
    await tick(5 * 24 * 60)

    jest.spyOn(deps.identity, "start").mockRejectedValue(new Error(`Verimi refused ${FAKE_NEW_REGISTRATION.owner.email}`))
    await order()
    await tick(60)

    const ids = await Promise.all([filed, failed, mismatched].map((reference) => flow.verificationId(reference)))
    return { secrets: secretsOf((await flow.stored(filed)).request), ids }
  }

  it("never logs what the customer entered, what the provider reported, the verification id or the link that starts the check", async () => {
    const console = captureConsole()
    const { secrets, ids } = await runEveryPath()
    console.restore()

    expect(console.output()).toContain("[mail] identityVerificationRequested")
    expect(console.output()).toContain("[identity]")
    for (const secret of [...secrets, ...ids, "Beispiel", "1991-01-01", "verification.example.test"]) expect(console.output()).not.toContain(secret)
  })
})

describe("the framework's own logs", () => {
  it("keeps Next's dev log of Server Function arguments off: the checkout action's arguments are the security codes", async () => {
    const { default: nextConfig } = await import("@/next.config")

    expect(nextConfig.logging).toMatchObject({ serverFunctions: false })
  })
})
