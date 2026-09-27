import "server-only"
import { SystemClock } from "@/src/adapters/clock/system/system-clock"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { PostgresApplicationRepository } from "@/src/adapters/repository/postgres/postgres-application-repository"
import { CryptoTokenGenerator } from "@/src/adapters/tokens/crypto/crypto-token-generator"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import type { Clock } from "@/src/core/ports/clock"
import type { TokenGenerator } from "@/src/core/ports/token-generator"
import { devSeed } from "@/db/seed/seed"
import { parseEnv, type Env, type EnvSource } from "./env"

/**
 * The composition root: the only place in the application that constructs an
 * adapter. Use cases receive their ports as arguments and never reach in here.
 *
 * `Clock` and `TokenGenerator` are real in every stage. They have no driver
 * variable because there is nothing to fake away — no network, no money, no
 * secret — and a frozen clock or a predictable status link in a running dev
 * server would be a bug, not a convenience. Tests inject the fakes directly.
 */
export interface Container {
  env: Env
  clock: Clock
  tokens: TokenGenerator
  repository: ApplicationRepository
}

export function createContainer(source: EnvSource = process.env): Container {
  const env = parseEnv(source)
  return {
    env,
    clock: new SystemClock(),
    tokens: new CryptoTokenGenerator(),
    repository: createRepository(env),
  }
}

/** Dev starts from the seed on every boot; a deployed stage on the fake starts empty. */
function createRepository(env: Env): ApplicationRepository {
  if (env.REPOSITORY_DRIVER === "fake") {
    return new InMemoryApplicationRepository(env.APP_ENV === "dev" ? devSeed(env.APP_ENV) : [])
  }
  return new PostgresApplicationRepository({
    connectionString: env.DATABASE_URL!,
    encryptionKey: env.CODES_ENCRYPTION_KEY!,
  })
}

let container: Container | undefined

/** Validated once per process, so a misconfigured deploy fails on its first request. */
export const getContainer = (): Container => (container ??= createContainer())
