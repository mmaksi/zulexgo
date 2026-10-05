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
import type { PaymentMethodKind } from "@/src/core/ports/payment/payment-provider"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"
import { pollDueApplications } from "@/src/core/use-cases/registration/poll-due-applications"
import { submitCheckout } from "@/src/core/use-cases/checkout/submit-checkout"

/** Every fake wired as the container wires them, for tests that drive the whole flow. */
export const MINUTE = 60_000
export const CATALOGUE: RejectionCatalogue = {
  101: { class: "correctable", reason: "Die FIN wurde nicht akzeptiert." },
  202: { class: "final", reason: "Das Fahrzeug ist bereits abgemeldet." },
}
export const CODES = Object.values(FAKE_REQUEST.codes)

export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

/** The service cannot be reached for this many hourly checks: every attempt to file a waiting application fails. */
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

  /** Checks out and pays, but leaves the payment notification unhandled. */
  async function payForCheckout(method: PaymentMethodKind = "card") {
    // Tests that run several orders at once put them all on one fake vehicle, so each customer here has confirmed the duplicate warning.
    const { reference } = await submitCheckout(deps, { service: "deregistration", request: FAKE_REQUEST, email: "customer@example.test", consents: FAKE_CONSENTS, acknowledgedDuplicate: true })
    await deps.payments.customerPays((await stored(reference)).payment.id, method)
    return reference
  }

  const confirm = (reference: ApplicationReference) => confirmPayment(deps, reference)

  /**
   * A Neuzulassung that has been paid for but whose payment notification is not handled yet. Checkout sells no
   * Neuzulassung (it is not on sale), so the order is stored as checkout would have left it: awaiting payment.
   */
  async function payForNewRegistration(method: PaymentMethodKind = "card") {
    const order = aNewRegistrationApplication({ status: "awaiting_payment", ikfzStatus: "online" })
    const total = SERVICE_PRICES.newRegistration
    const { paymentId } = await deps.payments.createPayment({ reference: order.reference, service: "newRegistration", amount: total, email: order.email })
    await deps.repository.create({
      ...order,
      history: [{ status: "awaiting_payment", at: clock.now() }],
      payment: { id: paymentId, total },
      idempotencyKey: deps.tokens.generate(),
    })
    await deps.payments.customerPays(paymentId, method)
    return order.reference
  }

  /** Pays for a Neuzulassung and handles the payment notification: it ends at status 2, waiting for the customer to verify. */
  async function checkoutAndPayNewRegistration(method: PaymentMethodKind = "card") {
    const reference = await payForNewRegistration(method)
    await confirm(reference)
    return reference
  }

  const verificationId = async (reference: ApplicationReference) => (await stored(reference)).identityVerification!.id

  /** The customer completes the check at the provider; by default as the person the order names. */
  async function customerVerifies(reference: ApplicationReference, person?: VerifiedPerson) {
    const { request } = await stored(reference)
    if (request.service !== "newRegistration") throw new Error("Only a Neuzulassung verifies")
    const { firstName, lastName, birthDate } = request.owner
    await deps.identity.customerFinishes(await verificationId(reference), { status: "verified", person: person ?? { firstName, lastName, birthDate } })
  }

  const customerFailsVerification = async (reference: ApplicationReference) =>
    deps.identity.customerFinishes(await verificationId(reference), { status: "failed" })

  async function checkoutAndPay(method: PaymentMethodKind = "card") {
    const reference = await payForCheckout(method)
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
