import { ValidationError } from "@/src/core/errors/validation-error"
import { validate } from "@/src/core/domain/validate"
import { vinSchema } from "./vin"

const parseVin = (input: unknown) => validate(vinSchema, input, "vin")

describe("parseVin", () => {
  it("accepts up to 17 characters, uppercased, so older short VINs still pass", () => {
    expect(parseVin(" wvwzzz1jzxw000001 ")).toBe("WVWZZZ1JZXW000001")
    expect(parseVin("AB12")).toBe("AB12")
  })

  it.each(["", "WVWZZZ1JZXW0000012", "WVW-ZZZ"])("rejects %p", (input) => {
    expect(() => parseVin(input)).toThrow(ValidationError)
  })

  it.each(["WVWZZZ1JZXW00ß1", "WVWZZZ1JZXW000ſ1", "WVWZZZ1JZXWﬀ0001", "ÄBC", "ǆ"])("rejects %p, whose upper case is not what was typed", (input) => {
    expect(() => parseVin(input)).toThrow(ValidationError)
  })
})
