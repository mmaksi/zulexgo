import "server-only"
import { SystemClock } from "@/src/adapters/clock/system/system-clock"
import { FakeIdentityVerification } from "@/src/adapters/identity/fake/fake-identity-verification"
import { ConsoleMailer } from "@/src/adapters/mail/console/console-mailer"
import { FakePaymentProvider } from "@/src/adapters/payment/fake/fake-payment-provider"
import { FakeRegistrationGateway } from "@/src/adapters/registration/fake/fake-registration-gateway"
import { ZulexRegistrationGateway } from "@/src/adapters/registration/zulex/zulex-registration-gateway"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { PostgresApplicationRepository } from "@/src/adapters/repository/postgres/postgres-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { CryptoTokenGenerator } from "@/src/adapters/tokens/crypto/crypto-token-generator"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import type { IdentityVerification } from "@/src/core/ports/identity-verification"
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
}

export function createContainer(source: EnvSource = process.env): Container {
  const env = parseEnv(source)
  const clock = new SystemClock()
  return {
    env,
    clock,
    tokens: new CryptoTokenGenerator(),
    repository: createRepository(env),
    registration:
      env.REGISTRATION_DRIVER === "fake"
        ? new FakeRegistrationGateway()
        : new ZulexRegistrationGateway({ baseUrl: env.ZULEX_BASE_URL!, apiKey: env.ZULEX_API_KEY! }),
    payments: env.PAYMENT_DRIVER === "fake" ? new FakePaymentProvider(clock) : notBuiltYet("PAYMENT_DRIVER=stripe", "M4"),
    mailer: env.MAIL_DRIVER === "console" ? new ConsoleMailer({ revealStatusLinks: env.APP_ENV === "dev" }) : notBuiltYet("MAIL_DRIVER=resend", "M4"),
    documents: env.STORAGE_DRIVER === "fake" ? new InMemoryDocumentStore() : notBuiltYet("STORAGE_DRIVER=supabase", "M5"),
    identity: new FakeIdentityVerification(),
    statusLink: (token) => new URL(`/status/${token}`, env.APP_BASE_URL).toString(),
  }
}

/** A real driver without its adapter must stop the boot, never fall back to a fake. */
function notBuiltYet(driver: string, milestone: string): never {
  throw new Error(`${driver} is configured, but its adapter arrives in ${milestone}.`)
}

/** On the in-memory repository every boot starts from the seed; a database is seeded by its deploy instead. */
function createRepository(env: Env): ApplicationRepository {
  if (env.REPOSITORY_DRIVER === "fake") return new InMemoryApplicationRepository(seedFor(env.APP_ENV))
  return new PostgresApplicationRepository({
    connectionString: env.DATABASE_URL!,
    encryptionKey: env.CODES_ENCRYPTION_KEY!,
  })
}

let container: Container | undefined

/** Validated once per process, so a misconfigured deploy fails on its first request. */
export const getContainer = (): Container => (container ??= createContainer())
