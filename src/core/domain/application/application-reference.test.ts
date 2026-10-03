import { ValidationError } from "@/src/core/errors/validation-error"
import { parseApplicationReference, referenceFromToken } from "./application-reference"

describe("parseApplicationReference", () => {
  it("accepts ZG- followed by six Crockford base32 characters", () => {
    expect(parseApplicationReference("ZG-7K3M9P")).toBe("ZG-7K3M9P")
  })

  it("forgives how a customer retypes it: case, spaces, and I/L/O read as 1 and 0", () => {
    expect(parseApplicationReference(" zg-ilo9pq ")).toBe("ZG-1109PQ")
  })

  it.each(["ZG-7K3M9", "ZG-7K3M9PX", "XX-7K3M9P", "ZG-7K3M9U"])("rejects %p", (input) => {
    expect(() => parseApplicationReference(input)).toThrow(ValidationError)
  })
})

describe("referenceFromToken", () => {
  it("derives a valid reference from a random token, deterministically", () => {
    const token = "faketoken-000001xxxxxxxxxxxxxxxxxxxxxxxxxxx"

    expect(referenceFromToken(token)).toMatch(/^ZG-[0-9A-HJKMNP-TV-Z]{6}$/)
    expect(referenceFromToken(token)).toBe(referenceFromToken(token))
  })

  it("depends on every character, so tokens that differ in one place give different references", () => {
    const references = new Set(
      Array.from({ length: 50 }, (_, index) =>
        referenceFromToken(`faketoken-${String(index).padStart(6, "0")}`.padEnd(43, "x")),
      ),
    )

    expect(references.size).toBe(50)
  })
})
