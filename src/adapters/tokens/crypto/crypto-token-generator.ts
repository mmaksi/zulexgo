import { randomBytes } from "node:crypto"
import type { TokenGenerator } from "@/src/core/ports/tokens/token-generator"

/** 256 bits: a status link has no other protection. */
const TOKEN_BYTES = 32

/**
 * `TokenGenerator` on Node's cryptographic RNG (`randomBytes`), the one place in the app
 * that reads it; real in every stage, dev included. 32 bytes in unpadded base64url come to
 * exactly `TOKEN_MIN_LENGTH` characters from the URL-safe alphabet the port requires.
 * Uniqueness rests on the entropy, not on bookkeeping. A token is a live credential for one
 * order: it is never logged outside dev (see `ConsoleMailer`).
 */
export class CryptoTokenGenerator implements TokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString("base64url")
  }
}
