import "server-only"
import { SystemClock } from "@/src/adapters/clock/system/system-clock"
import { FakeIdentityVerification } from "@/src/adapters/identity/fake/fake-identity-verification"
import { ConsoleMailer } from "@/src/adapters/mail/console/console-mailer"
import { ResendMailer } from "@/src/adapters/mail/resend/resend-mailer"
import { FakePaymentProvider } from "@/src/adapters/payment/fake/fake-payment-provider"
import { StripePaymentProvider } from "@/src/adapters/payment/stripe/stripe-payment-provider"
import { FakeRegistrationGateway } from "@/src/adapters/registration/fake/fake-registration-gateway"
import { ZulexRegistrationGateway } from "@/src/adapters/registration/zulex/zulex-registration-gateway"
import { InMemoryRateLimiter } from "@/src/adapters/rate-limit/fake/in-memory-rate-limiter"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { PostgresApplicationRepository } from "@/src/adapters/repository/postgres/postgres-application-repository"
import { PostgresRateLimiter } from "@/src/adapters/repository/postgres/postgres-rate-limiter"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { SupabaseDocumentStore } from "@/src/adapters/storage/supabase/supabase-document-store"
import { CryptoTokenGenerator } from "@/src/adapters/tokens/crypto/crypto-token-generator"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import type { Clock } from "@/src/core/ports/clock"
import type { IdentityVerification } from "@/src/core/ports/identity-verification"
import type { RateLimiter } from "@/src/core/ports/rate-limiter"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { seedFor } from "@/db/seed/seed"
import { parseEnv, type Env, type EnvSource } from "./env"

/**
 * The composition root: the only place in the application that constructs an
 * adapter. Use cases receive their ports as arguments and never reach in here.
 *
 * `Clock` and `TokenGenerator` are real in every stage. They have no driver
 * variable because there is nothing to fake away — no network, no money, no
 * secret — and a frozen clock or a predictable status link in a running dev
 * server would be a bug, not a convenience. Tests inject the fakes directly.
 *
 * Identity verification has no driver yet: Verimi is added later (launch plan
 * Q1–Q4), so its fake is wired everywhere until `IDENTITY_DRIVER` exists.
 */
export interface Container extends Dependencies {
  readonly env: Env
  readonly identity: IdentityVerification
  /**
   * Only on the fake payment provider, which has no browser to pay in: plays
   * the customer paying, so the funnel runs end to end without Stripe keys.
   */
  readonly simulateCustomerPayment?: (paymentId: string) => Promise<void>
}

export function createContainer(source: EnvSource = process.env): Container {
  const env = parseEnv(source)
  const clock = new SystemClock()
  const fakePayments = env.PAYMENT_DRIVER === "fake" ? new FakePaymentProvider(clock) : undefined
  return {
    env,
    clock,
    tokens: new CryptoTokenGenerator(),
    repository: createRepository(env),
    rateLimiter: createRateLimiter(env, clock),
    registration:
      env.REGISTRATION_DRIVER === "fake"
        ? new FakeRegistrationGateway()
        : new ZulexRegistrationGateway({ baseUrl: env.ZULEX_BASE_URL!, apiKey: env.ZULEX_API_KEY! }),
    payments:
      fakePayments ??
      new StripePaymentProvider({ secretKey: env.STRIPE_SECRET_KEY!, webhookSecret: env.STRIPE_WEBHOOK_SECRET! }),
    simulateCustomerPayment: fakePayments && ((paymentId) => fakePayments.customerPays(paymentId, "card")),
    mailer:
      env.MAIL_DRIVER === "console"
        ? new ConsoleMailer({ revealStatusLinks: env.APP_ENV === "dev" })
        : new ResendMailer({
            apiKey: env.RESEND_API_KEY!,
            from: env.MAIL_FROM!,
            allowlist: env.APP_ENV === "staging" ? env.MAIL_ALLOWLIST : undefined,
          }),
    documents:
      env.STORAGE_DRIVER === "fake"
        ? new InMemoryDocumentStore()
        : new SupabaseDocumentStore({
            url: env.SUPABASE_STORAGE_URL!,
            bucket: env.SUPABASE_STORAGE_BUCKET!,
            serviceKey: env.SUPABASE_STORAGE_SERVICE_KEY!,
          }),
    identity: new FakeIdentityVerification(),
    statusLink: (token) => new URL(`/status/${token}`, env.APP_BASE_URL).toString(),
  }
}

/** On the in-memory repository every boot starts from the seed; a database is seeded by its deploy instead. */
function createRepository(env: Env): ApplicationRepository {
  if (env.REPOSITORY_DRIVER === "fake") return new InMemoryApplicationRepository(seedFor(env.APP_ENV))
  return new PostgresApplicationRepository({
    connectionString: env.DATABASE_URL!,
    encryptionKey: env.CODES_ENCRYPTION_KEY!,
  })
}

/** Counts must be shared by every instance, so the limiter lives wherever the repository does: in memory only while the repository is. */
function createRateLimiter(env: Env, clock: Clock): RateLimiter {
  if (env.REPOSITORY_DRIVER === "fake") return new InMemoryRateLimiter(clock)
  return new PostgresRateLimiter({ connectionString: env.DATABASE_URL!, secret: env.CODES_ENCRYPTION_KEY!, clock })
}

let container: Container | undefined

/** Validated once per process, so a misconfigured deploy fails on its first request. */
export const getContainer = (): Container => (container ??= createContainer())
