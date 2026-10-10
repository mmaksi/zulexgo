import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16

export class FieldCipher {
  readonly #keys: Buffer[]

  constructor(base64Key: string, retiredBase64Keys: readonly string[] = []) {
    this.#keys = [base64Key, ...retiredBase64Keys].map((key) => Buffer.from(key, "base64"))
  }

  encrypt(plaintext: string, row: string): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.#keys[0], iv).setAAD(Buffer.from(row))
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")
  }

  // No key id is stored: each key is tried in turn, and GCM's tag refuses every wrong one.
  decrypt(stored: string, row: string): string {
    const bytes = Buffer.from(stored, "base64")
    let refused: unknown
    for (const key of this.#keys) {
      try {
        return open(key, bytes, row)
      } catch (error) {
        refused ??= error
      }
    }
    throw refused
  }

  // Unkeyed is safe only for high-entropy values such as 256-bit status tokens, and survives key rotation.
  hash(value: string): string {
    return createHash("sha256").update(value).digest("hex")
  }
}

function open(key: Buffer, bytes: Buffer, row: string): string {
  const decipher = createDecipheriv(ALGORITHM, key, bytes.subarray(0, IV_BYTES))
    .setAAD(Buffer.from(row))
    .setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
  return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8")
}
