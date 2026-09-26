import { ValidationError } from "@/src/core/errors/validation-error"
import { parseApplicationReference } from "./application-reference"

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
