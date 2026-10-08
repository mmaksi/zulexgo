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
import type { ApplicationRepository } from "@/src/core/ports/repository/application-repository"
import type { Clock } from "@/src/core/ports/clock/clock"
import type { IdentityVerification } from "@/src/core/ports/identity/identity-verification"
import type { RateLimiter } from "@/src/core/ports/rate-limit/rate-limiter"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { seedDocumentsFor, seedFor, seedPaymentsFor } from "@/db/seed/seed"
import { betaOf, parseEnv, type Env, type EnvSource } from "./env"

/**
 * The composition root: the only place in the application that constructs an
 * adapter. Use cases receive their ports as arguments and never reach in here.
 *
 * `Clock` and `TokenGenerator` are real in every stage. They have no driver
 * variable because there is nothing to fake away — no network, no money, no
 * secret — and a frozen clock or a predictable status link in a running dev
 * server would be a bug, not a convenience. Tests inject the fakes directly.
 *
 * Identity verification is the fake in every stage for now (`IDENTITY_DRIVER`): Verimi is added later
 * (launch plan Q1–Q3), and `parseEnv` refuses the fake in production once a service that verifies the
 * customer is on sale.
 *
 * The container holds the Zulex `X-Api-Key` and the Stripe, Resend, Supabase
 * and database credentials, so it is server-only: importing it from a client
 * component is a build error (`server-only`).
 */
export interface Container extends Dependencies {
  /**
   * The validated environment, for the few callers that read configuration
   * directly (the poll route's `CRON_SECRET`, the funnel's Stripe publishable key).
   */
  readonly env: Env
  /**
   * Only on the fake payment provider, which has no browser to pay in: plays
   * the customer paying, so the funnel runs end to end without Stripe keys.
   */
  readonly simulateCustomerPayment?: (paymentId: string) => Promise<void>
}

/**
 * Wires one adapter per port from `source`, which is `process.env` in the
 * running app and a literal in tests.
 *
 * The `*_DRIVER` variables choose each adapter and default to the fake or
 * console one, so dev needs no secrets. `parseEnv` refuses a production
 * environment that selects any of those and requires the credentials of every
 * real adapter, which is why the non-null assertions below are safe. `APP_ENV`
 * decides the rest: only dev prints status links when it "sends" mail, and the
 * fakes load a seed that `seedFor` refuses to hand out in production.
 *
 * @throws {EnvironmentError} before any adapter is built, if the environment is invalid.
 */
export function createContainer(source: EnvSource = process.env): Container {
  const env = parseEnv(source)
  const clock = new SystemClock()
  // Built ahead of the object because the container also exposes its `customerPays`
  // as `simulateCustomerPayment`.
  const fakePayments = env.PAYMENT_DRIVER === "fake" ? new FakePaymentProvider(clock, seedPaymentsFor(env.APP_ENV)) : undefined
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
    // Only staging restricts Resend to an allowlist. Production mails everyone (`parseEnv`
    // rejects a non-empty list there) and dev never gets here (`parseEnv` requires console).
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
        ? new InMemoryDocumentStore(seedDocumentsFor(env.APP_ENV))
        : new SupabaseDocumentStore({
            url: env.SUPABASE_STORAGE_URL!,
            bucket: env.SUPABASE_STORAGE_BUCKET!,
            serviceKey: env.SUPABASE_STORAGE_SERVICE_KEY!,
          }),
    identity: createIdentity(env),
    servicesOnSale: env.SERVICES_ON_SALE,
    beta: betaOf(env),
    statusLink: (token) => new URL(`/status/${token}`, env.APP_BASE_URL).toString(),
  }
}

/**
 * On the in-memory repository every boot starts from the seed; a database is seeded by
 * its deploy instead. The app connects through `DATABASE_URL`, the transaction pooler;
 * `DIRECT_DATABASE_URL` is for the db commands.
 */
function createRepository(env: Env): ApplicationRepository {
  if (env.REPOSITORY_DRIVER === "fake") return new InMemoryApplicationRepository(seedFor(env.APP_ENV))
  return new PostgresApplicationRepository({
    connectionString: env.DATABASE_URL!,
    encryptionKey: env.CODES_ENCRYPTION_KEY!,
  })
}

/** A `switch` with no default: a driver added to `IDENTITY_DRIVER` does not compile until it is wired here. */
function createIdentity(env: Env): IdentityVerification {
  switch (env.IDENTITY_DRIVER) {
    case "fake":
      return new FakeIdentityVerification()
  }
}

/** Counts must be shared by every instance, so the limiter lives wherever the repository does: in memory only while the repository is. */
function createRateLimiter(env: Env, clock: Clock): RateLimiter {
  if (env.REPOSITORY_DRIVER === "fake") return new InMemoryRateLimiter(clock)
  return new PostgresRateLimiter({ connectionString: env.DATABASE_URL!, secret: env.CODES_ENCRYPTION_KEY!, clock })
}

let container: Container | undefined

/**
 * The process-wide container. Validated once per process, so a misconfigured deploy
 * fails on its first request.
 *
 * It is built on first use, not at import, so loading a module that depends on it
 * reads no environment and opens no connection. It is shared because the in-memory
 * fakes keep their state in the instance and each Postgres adapter owns a connection
 * pool. A build that throws is not remembered; the next call tries again.
 */
export const getContainer = (): Container => (container ??= createContainer())
