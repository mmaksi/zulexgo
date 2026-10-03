import { inspect } from "node:util"
import { ValidationError } from "@/src/core/errors/validation-error"
import { parseRegistrationCertificatePart2 } from "./registration-certificate-part2"

const valid = { number: "AB123456", securityCode: "K9Z2W4M" }

const fieldsRejected = (input: unknown) => {
  try {
    parseRegistrationCertificatePart2(input)
  } catch (error) {
    if (error instanceof ValidationError) return error.fields
    throw error
  }
  throw new Error("expected a ValidationError")
}

describe("parseRegistrationCertificatePart2", () => {
  it("takes the Teil II number and its security code, trimmed and otherwise as typed", () => {
    const part2 = parseRegistrationCertificatePart2({ number: " ab123456 ", securityCode: " k9z2w4m " })

    expect(part2.number).toBe("ab123456")
    expect(part2.securityCode.reveal()).toBe("k9z2w4m")
  })

  describe("the number: 1 to 20 characters, the API's limits", () => {
    it.each([1, 20])("accepts %i characters", (length) => {
      expect(parseRegistrationCertificatePart2({ ...valid, number: "A".repeat(length) }).number).toHaveLength(length)
    })

    it.each([["", 0], ["   ", 0], ["A".repeat(21), 21]])("refuses %p", (number) => {
      expect(fieldsRejected({ ...valid, number })).toEqual(["number"])
    })
  })

  describe("the security code: at least one character, since the API says no more", () => {
    it("accepts one character", () => {
      expect(parseRegistrationCertificatePart2({ ...valid, securityCode: "K" }).securityCode.reveal()).toBe("K")
    })

    it.each(["", "   "])("refuses %p", (securityCode) => {
      expect(fieldsRejected({ ...valid, securityCode })).toEqual(["securityCode"])
    })
  })

  it("names every wrong field at once, with its own path", () => {
    expect(fieldsRejected({ number: "", securityCode: "" })).toEqual(["number", "securityCode"])
  })

  it("prints the security code as a placeholder, and never reaches it through the request's text forms", () => {
    const part2 = parseRegistrationCertificatePart2(valid)

    expect(JSON.stringify(part2)).not.toContain("K9Z2W4M")
    expect(inspect(part2, { depth: null })).not.toContain("K9Z2W4M")
    expect(String(part2.securityCode)).not.toContain("K9Z2W4M")
  })
})
