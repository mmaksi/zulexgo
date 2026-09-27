import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * AES-256-GCM for the columns that must never be readable in the database:
 * security codes and status tokens. The key stays in the app's environment,
 * off the database host. Each value is bound to its row, so a ciphertext
 * copied onto another application fails to decrypt instead of leaking.
 */
export class FieldCipher {
  readonly #key: Buffer

  constructor(base64Key: string) {
    this.#key = Buffer.from(base64Key, "base64")
  }

  /** Stored as base64(iv | tag | ciphertext). */
  encrypt(plaintext: string, row: string): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.#key, iv).setAAD(Buffer.from(row))
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")
  }

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
