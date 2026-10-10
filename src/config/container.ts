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
import { createPool } from "@/src/adapters/repository/postgres/pool"
import { PostgresRateLimiter } from "@/src/adapters/repository/postgres/postgres-rate-limiter"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { SupabaseDocumentStore } from "@/src/adapters/storage/supabase/supabase-document-store"
import { CryptoTokenGenerator } from "@/src/adapters/tokens/crypto/crypto-token-generator"
import type { IdentityVerification } from "@/src/core/ports/identity/identity-verification"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { seedDocumentsFor, seedFor, seedPaymentsFor } from "@/db/seed/seed"
import { betaOf, parseEnv, type Env, type EnvSource } from "./env"

export interface Container extends Dependencies {
  readonly env: Env
  readonly simulateCustomerPayment?: (paymentId: string) => Promise<void>
}

export function createContainer(source: EnvSource = process.env): Container {
  const env = parseEnv(source)
  const clock = new SystemClock()
  const fakePayments = env.PAYMENT_DRIVER === "fake" ? new FakePaymentProvider(clock, seedPaymentsFor(env.APP_ENV)) : undefined
  const pool = env.REPOSITORY_DRIVER === "postgres" ? createPool(env.DATABASE_URL!, env.DATABASE_CA_CERT) : undefined
  return {
    env,
    clock,
    tokens: new CryptoTokenGenerator(),
    repository: pool
      ? new PostgresApplicationRepository({ pool, encryptionKey: env.CODES_ENCRYPTION_KEY!, retiredEncryptionKeys: env.RETIRED_CODES_ENCRYPTION_KEYS })
      : new InMemoryApplicationRepository(seedFor(env.APP_ENV)),
    // Counts must be shared across instances, so the limiter is in memory only while the repository is.
    rateLimiter: pool ? new PostgresRateLimiter({ pool, secret: env.CODES_ENCRYPTION_KEY!, clock }) : new InMemoryRateLimiter(clock),
    registration:
      env.REGISTRATION_DRIVER === "fake"
        ? new FakeRegistrationGateway()
        : new ZulexRegistrationGateway({ baseUrl: env.ZULEX_BASE_URL!, apiKey: env.ZULEX_API_KEY! }),
    payments:
      fakePayments ??
      new StripePaymentProvider({ secretKey: env.STRIPE_SECRET_KEY!, webhookSecret: env.STRIPE_WEBHOOK_SECRET! }),
    simulateCustomerPayment: fakePayments && ((paymentId) => fakePayments.customerPays(paymentId)),
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

function createIdentity(env: Env): IdentityVerification {
  switch (env.IDENTITY_DRIVER) {
    case "fake":
      return new FakeIdentityVerification()
  }
}

let container: Container | undefined

export const getContainer = (): Container => (container ??= createContainer())
