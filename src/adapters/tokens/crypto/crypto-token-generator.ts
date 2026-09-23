import { randomBytes } from "node:crypto"
import type { TokenGenerator } from "@/src/core/ports/token-generator"

/** 256 bits: a status link has no other protection. */
const TOKEN_BYTES = 32

export class CryptoTokenGenerator implements TokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString("base64url")
  }
}
