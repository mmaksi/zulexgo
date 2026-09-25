import "server-only"
import { SystemClock } from "@/src/adapters/clock/system/system-clock"
import { CryptoTokenGenerator } from "@/src/adapters/tokens/crypto/crypto-token-generator"
import type { Clock } from "@/src/core/ports/clock"
import type { TokenGenerator } from "@/src/core/ports/token-generator"
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
}

export function createContainer(source: EnvSource = process.env): Container {
  return {
    env: parseEnv(source),
    clock: new SystemClock(),
    tokens: new CryptoTokenGenerator(),
  }
}

let container: Container | undefined

/** Validated once per process, so a misconfigured deploy fails on its first request. */
export const getContainer = (): Container => (container ??= createContainer())
