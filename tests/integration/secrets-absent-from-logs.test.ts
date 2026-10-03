import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { ConsoleMailer } from "@/src/adapters/mail/console/console-mailer"
import { FakePaymentProvider } from "@/src/adapters/payment/fake/fake-payment-provider"
import { FakeRegistrationGateway } from "@/src/adapters/registration/fake/fake-registration-gateway"
import { InMemoryRateLimiter } from "@/src/adapters/rate-limit/fake/in-memory-rate-limiter"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { FakeTokenGenerator } from "@/src/adapters/tokens/fake/fake-token-generator"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"
import { confirmRefund } from "@/src/core/use-cases/payment/confirm-refund"
import { pollDueApplications } from "@/src/core/use-cases/registration/poll-due-applications"
import { resendStatusLink } from "@/src/core/use-cases/status/resend-status-link"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"

/**
 * CLAUDE.md non-negotiable: security codes never reach a log, in any stage.
 * Status tokens may appear only in dev, where the console mailer prints the
 * link so a developer can open the status page; every other stage keeps them
 * out, since its logs outlive the request.
 */
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

/** Every path that logs: each email, a silent retry, a final failure with its refund, a re-sent link, and a rejected checkout. */
async function runEveryPath(revealStatusLinks: boolean): Promise<string[]> {
  const clock = new FakeClock(new Date("2026-03-01T09:00:00.000Z"))
  const deps = {
    repository: new InMemoryApplicationRepository(),
    registration: new FakeRegistrationGateway(),
    payments: new FakePaymentProvider(clock),
    mailer: new ConsoleMailer({ revealStatusLinks }),
    documents: new InMemoryDocumentStore(),
    rateLimiter: new InMemoryRateLimiter(clock),
    clock,
    tokens: new FakeTokenGenerator(),
    statusLink: (token: string) => `https://zulexgo.example.test/status/${token}`,
    errorCatalogue: { 202: { class: "final" as const, reason: "Das Fahrzeug ist bereits abgemeldet." } },
  }
  const poll = (minutes: number) => {
    clock.advance(minutes * 60_000)
    return pollDueApplications(deps, 50)
  }
  const checkoutAndPay = async () => {
    const { reference } = await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test" })
    await deps.payments.customerPays((await deps.repository.get(reference))!.payment.id, "card")
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
  await confirmRefund(deps, rejected)
  await resendStatusLink(deps, { reference: completed, email: "customer@example.test" })

  const badCodes = { ...FAKE_REQUEST, codes: { ...FAKE_REQUEST.codes, certificate: `${FAKE_REQUEST.codes.certificate}X` } }
  await submitCheckout(deps, { service: "deregistration", request: badCodes, email: "customer@example.test" }).catch((error) => console.error(error))

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

describe("the framework's own logs", () => {
  it("keeps Next's dev log of Server Function arguments off: the checkout action's arguments are the security codes", async () => {
    const { default: nextConfig } = await import("@/next.config")

    expect(nextConfig.logging).toMatchObject({ serverFunctions: false })
  })
})
