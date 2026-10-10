import { FAKE_CONSENTS, FAKE_REQUEST, aNewRegistrationApplication } from "@/tests/fixtures/applications"
import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { FakeIdentityVerification } from "@/src/adapters/identity/fake/fake-identity-verification"
import { FakeMailer } from "@/src/adapters/mail/fake/fake-mailer"
import { FakePaymentProvider } from "@/src/adapters/payment/fake/fake-payment-provider"
import { FakeRegistrationGateway } from "@/src/adapters/registration/fake/fake-registration-gateway"
import { InMemoryRateLimiter } from "@/src/adapters/rate-limit/fake/in-memory-rate-limiter"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { FakeTokenGenerator } from "@/src/adapters/tokens/fake/fake-token-generator"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { SERVICE_PRICES } from "@/src/core/domain/payment/pricing"
import type { VerifiedPerson } from "@/src/core/domain/customer/verified-person"
import { GatewayUnavailable } from "@/src/core/errors/registration/gateway-unavailable"
import type { RejectionCatalogue } from "@/src/core/domain/registration/rejection-catalogue"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"
import { pollDueApplications } from "@/src/core/use-cases/registration/poll-due-applications"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"

export const MINUTE = 60_000
export const CATALOGUE: RejectionCatalogue = {
  101: { class: "correctable", reason: "Die FIN wurde nicht akzeptiert." },
  202: { class: "final", reason: "Das Fahrzeug ist bereits abgemeldet." },
}
export const CODES = Object.values(FAKE_REQUEST.codes)

export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export async function keepServiceDown(flow: Pick<ReturnType<typeof setupFlow>, "deps" | "poll">, hours: number) {
  for (let hour = 0; hour < hours; hour++) {
    flow.deps.registration.failNext("submit", new GatewayUnavailable())
    await flow.poll(60)
  }
}

export function setupFlow() {
  const clock = new FakeClock(new Date("2026-03-01T09:00:00.000Z"))
  const deps = {
    repository: new InMemoryApplicationRepository(),
    registration: new FakeRegistrationGateway(),
    payments: new FakePaymentProvider(clock),
    identity: new FakeIdentityVerification(),
    mailer: new FakeMailer(),
    documents: new InMemoryDocumentStore(),
    rateLimiter: new InMemoryRateLimiter(clock),
    clock,
    tokens: new FakeTokenGenerator(),
    statusLink: (token: string) => `https://zulexgo.example.test/status/${token}`,
    errorCatalogue: CATALOGUE,
    servicesOnSale: ["deregistration"] as const,
  }

  const emails = () => deps.mailer.sent.map((message) => message.template.name)
  const stored = async (reference: ApplicationReference) => (await deps.repository.get(reference))!
  const zulexId = async (reference: ApplicationReference) => (await stored(reference)).zulexApplicationId!
  const payment = async (reference: ApplicationReference) => deps.payments.getPayment((await stored(reference)).payment.id)
  const poll = async (afterMinutes: number) => {
    clock.advance(afterMinutes * MINUTE)
    return pollDueApplications(deps, 50)
  }

  async function payForCheckout() {
    const { reference } = await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test", consents: FAKE_CONSENTS, acknowledgedDuplicate: true })
    await deps.payments.customerPays((await stored(reference)).payment.id)
    return reference
  }

  const confirm = (reference: ApplicationReference) => confirmPayment(deps, reference)

  async function payForNewRegistration() {
    const order = aNewRegistrationApplication({ status: "awaiting_payment", ikfzStatus: "online" })
    const total = SERVICE_PRICES.newRegistration
    const { paymentId } = await deps.payments.createPayment({ reference: order.reference, service: "newRegistration", amount: total, email: order.email })
    await deps.repository.create({
      ...order,
      history: [{ status: "awaiting_payment", at: clock.now() }],
      payment: { id: paymentId, total },
      idempotencyKey: deps.tokens.generate(),
    })
    await deps.payments.customerPays(paymentId)
    return order.reference
  }

  async function checkoutAndPayNewRegistration() {
    const reference = await payForNewRegistration()
    await confirm(reference)
    return reference
  }

  const verificationId = async (reference: ApplicationReference) => (await stored(reference)).identityVerification!.id

  async function customerVerifies(reference: ApplicationReference, person?: VerifiedPerson) {
    const { request } = await stored(reference)
    if (request.service !== "newRegistration") throw new Error("Only a Neuzulassung verifies")
    const { firstName, lastName, birthDate } = request.owner
    await deps.identity.customerFinishes(await verificationId(reference), { status: "verified", person: person ?? { firstName, lastName, birthDate } })
  }

  const customerFailsVerification = async (reference: ApplicationReference) =>
    deps.identity.customerFinishes(await verificationId(reference), { status: "failed" })

  async function checkoutAndPay() {
    const reference = await payForCheckout()
    await confirm(reference)
    return reference
  }

  return {
    deps,
    clock,
    emails,
    stored,
    zulexId,
    payment,
    poll,
    payForCheckout,
    confirm,
    checkoutAndPay,
    payForNewRegistration,
    checkoutAndPayNewRegistration,
    verificationId,
    customerVerifies,
    customerFailsVerification,
  }
}
