import { ValidationError } from "@/src/core/errors/validation-error"
import { parseLicencePlate } from "./licence-plate"

describe("parseLicencePlate", () => {
  it("accepts a plate and normalises case and whitespace", () => {
    expect(parseLicencePlate({ prefix: " m ", letters: "ab", numbers: "123" })).toEqual({
      prefix: "M",
      letters: "AB",
      numbers: "123",
    })
  })

  it("allows umlauts in the prefix only", () => {
    expect(parseLicencePlate({ prefix: "LÖ", letters: "A", numbers: "1" }).prefix).toBe("LÖ")
    expect(() => parseLicencePlate({ prefix: "M", letters: "Ö", numbers: "1" })).toThrow(ValidationError)
  })

  it.each([
    ["a four-letter prefix", { prefix: "ABCD", letters: "A", numbers: "1" }, "prefix"],
    ["three letters", { prefix: "M", letters: "ABC", numbers: "1" }, "letters"],
    ["a leading zero", { prefix: "M", letters: "A", numbers: "012" }, "numbers"],
    ["five digits", { prefix: "M", letters: "A", numbers: "12345" }, "numbers"],
    ["no digits", { prefix: "M", letters: "A", numbers: "" }, "numbers"],
  ])("rejects %s, naming the field", (_, input, field) => {
    expect(() => parseLicencePlate(input)).toThrow(expect.objectContaining({ fields: [field] }))
  })
})
