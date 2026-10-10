import { randomBytes } from "node:crypto"
import { FieldCipher } from "./field-cipher"

const key = () => randomBytes(32).toString("base64")

describe("FieldCipher", () => {
  it("decrypts what it encrypted for the same row", () => {
    const cipher = new FieldCipher(key())

    expect(cipher.decrypt(cipher.encrypt("AAAAAA1", "ZG-000001"), "ZG-000001")).toBe("AAAAAA1")
  })

  it("never stores the plaintext and never repeats a ciphertext", () => {
    const cipher = new FieldCipher(key())

    const first = cipher.encrypt("AAAAAA1", "ZG-000001")
    const second = cipher.encrypt("AAAAAA1", "ZG-000001")

    expect(first).not.toContain("AAAAAA1")
    expect(first).not.toBe(second)
  })

  it("refuses a ciphertext moved to another row", () => {
    const cipher = new FieldCipher(key())

    expect(() => cipher.decrypt(cipher.encrypt("AAAAAA1", "ZG-000001"), "ZG-000002")).toThrow()
  })

  it("refuses a tampered ciphertext", () => {
    const cipher = new FieldCipher(key())
    const stored = Buffer.from(cipher.encrypt("AAAAAA1", "ZG-000001"), "base64")
    stored[stored.length - 1] ^= 1

    expect(() => cipher.decrypt(stored.toString("base64"), "ZG-000001")).toThrow()
  })

  it("refuses a ciphertext made with another key", () => {
    const stored = new FieldCipher(key()).encrypt("AAAAAA1", "ZG-000001")

    expect(() => new FieldCipher(key()).decrypt(stored, "ZG-000001")).toThrow()
  })

  it("reads what a retired key wrote, and writes with the current key only", () => {
    const [retired, current] = [key(), key()]
    const stored = new FieldCipher(retired).encrypt("AAAAAA1", "ZG-000001")
    const rotated = new FieldCipher(current, [retired])

    expect(rotated.decrypt(stored, "ZG-000001")).toBe("AAAAAA1")
    expect(() => new FieldCipher(retired).decrypt(rotated.encrypt("AAAAAA1", "ZG-000001"), "ZG-000001")).toThrow()
  })

  it("hashes a lookup value the same way every time, without revealing it", () => {
    const cipher = new FieldCipher(key())

    expect(cipher.hash("faketoken-1")).toBe(cipher.hash("faketoken-1"))
    expect(cipher.hash("faketoken-1")).not.toBe(cipher.hash("faketoken-2"))
    expect(cipher.hash("faketoken-1")).not.toContain("faketoken")
  })
})
