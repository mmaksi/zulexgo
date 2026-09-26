import { ValidationError } from "@/src/core/errors/validation-error"
import { parseVin } from "./vin"

describe("parseVin", () => {
  it("accepts up to 17 characters, uppercased, so older short VINs still pass", () => {
    expect(parseVin(" wvwzzz1jzxw000001 ")).toBe("WVWZZZ1JZXW000001")
    expect(parseVin("AB12")).toBe("AB12")
  })

  it.each(["", "WVWZZZ1JZXW0000012", "WVW-ZZZ"])("rejects %p", (input) => {
    expect(() => parseVin(input)).toThrow(ValidationError)
  })
})
