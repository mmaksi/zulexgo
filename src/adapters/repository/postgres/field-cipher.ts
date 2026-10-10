import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16

// No key id is stored: rotating CODES_ENCRYPTION_KEY makes existing values unreadable until re-encrypted.
export class FieldCipher {
  readonly #key: Buffer

  constructor(base64Key: string) {
    this.#key = Buffer.from(base64Key, "base64")
  }

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

  // Unkeyed is safe only for high-entropy values such as 256-bit status tokens, and survives key rotation.
  hash(value: string): string {
    return createHash("sha256").update(value).digest("hex")
  }
}
