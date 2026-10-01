import { setupServer } from "msw/node"
import { ZULEX_BASE_URL } from "@/tests/fixtures/zulex"
import { STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET, StripeDouble } from "@/tests/msw/stripe"
import { ZULEX_TEST_API_KEY, ZulexDouble } from "@/tests/msw/zulex"
import { FakeClock } from "@/src/adapters/clock/fake/fake-clock"
import { FakeMailer } from "@/src/adapters/mail/fake/fake-mailer"
import { StripePaymentProvider } from "@/src/adapters/payment/stripe/stripe-payment-provider"
import { ZulexRegistrationGateway } from "@/src/adapters/registration/zulex/zulex-registration-gateway"
import { InMemoryRateLimiter } from "@/src/adapters/rate-limit/fake/in-memory-rate-limiter"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { FakeTokenGenerator } from "@/src/adapters/tokens/fake/fake-token-generator"
import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

/**
 * The real Stripe and Zulex adapters, with both vendors stubbed at the network
 * boundary; repository, mail and storage in memory. Registers the msw
 * lifecycle, so call it once at the top of a test file.
 */
export function withVendorsAtTheNetwork() {
  const server = setupServer()
  const world = {} as {
    zulex: ZulexDouble
    stripe: StripeDouble
    clock: FakeClock
    mailer: FakeMailer
    deps: Dependencies & { repository: InMemoryApplicationRepository; mailer: FakeMailer; clock: FakeClock }
  }

  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  beforeEach(() => {
    world.zulex = new ZulexDouble()
    world.stripe = new StripeDouble()
    server.resetHandlers(...world.zulex.handlers, ...world.stripe.handlers)
    world.clock = new FakeClock(new Date("2026-03-01T09:00:00.000Z"))
    world.mailer = new FakeMailer()
    world.deps = {
      repository: new InMemoryApplicationRepository(),
      registration: new ZulexRegistrationGateway({ baseUrl: ZULEX_BASE_URL, apiKey: ZULEX_TEST_API_KEY }),
      payments: new StripePaymentProvider({ secretKey: STRIPE_TEST_SECRET_KEY, webhookSecret: STRIPE_TEST_WEBHOOK_SECRET }),
      mailer: world.mailer,
      documents: new InMemoryDocumentStore(),
      rateLimiter: new InMemoryRateLimiter(world.clock),
      clock: world.clock,
      tokens: new FakeTokenGenerator(),
      statusLink: (token) => `https://zulexgo.example.test/status/${token}`,
    }
  })
  afterAll(() => server.close())

  return {
    world,
    stored: async (reference: ApplicationReference) => (await world.deps.repository.get(reference))!,
    emails: () => world.mailer.sent.map((message) => message.template.name),
  }
}

export const webhookRequest = ({ payload, signature }: { payload: string; signature?: string }) =>
  new Request("https://zulexgo.example.test/api/webhooks/stripe", {
    method: "POST",
    body: payload,
    headers: signature ? { "stripe-signature": signature } : {},
  })
