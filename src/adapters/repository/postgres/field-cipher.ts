import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
/** 96 bits, the nonce size GCM is specified around. */
const IV_BYTES = 12
/** The full 128-bit GCM authentication tag, so a forged or altered ciphertext cannot pass. */
const TAG_BYTES = 16

/**
 * AES-256-GCM for the columns that must never be readable in the database:
 * security codes and status tokens. The key stays in the app's environment,
 * off the database host. Each value is bound to its row, so a ciphertext
 * copied onto another application fails to decrypt instead of leaking.
 *
 * Used by `PostgresApplicationRepository` (security codes, status tokens) with `CODES_ENCRYPTION_KEY`.
 * The stored value carries no key id, so there is one key at a time: a rotated key cannot read what
 * the old one wrote, and existing values would have to be re-encrypted. Only `hash` is
 * independent of the key.
 */
export class FieldCipher {
  readonly #key: Buffer

  /**
   * `base64Key` must decode to 32 bytes. This is not checked here: `src/config/env.ts` rejects a wrong
   * length at boot, and otherwise `createCipheriv` throws on first use.
   */
  constructor(base64Key: string) {
    this.#key = Buffer.from(base64Key, "base64")
  }

  /**
   * Stored as base64(iv | tag | ciphertext). The IV is fresh and random per call, so the same
   * plaintext twice gives two different values. `row` is the application reference, passed as
   * additional authenticated data: it is not stored, and decrypting under a different one fails.
   */
  encrypt(plaintext: string, row: string): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.#key, iv).setAAD(Buffer.from(row))
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")
  }

  /** Throws if the key, the `row`, or any byte of `stored` differs from what `encrypt` used. */
  decrypt(stored: string, row: string): string {
    const bytes = Buffer.from(stored, "base64")
    const decipher = createDecipheriv(ALGORITHM, this.#key, bytes.subarray(0, IV_BYTES))
      .setAAD(Buffer.from(row))
      .setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8")
  }

  /**
   * Lookup key for a status token. The token is 256 random bits, so an unkeyed
   * hash cannot be reversed, and lookups survive a rotation of the key.
   */
  hash(value: string): string {
    return createHash("sha256").update(value).digest("hex")
  }
}
