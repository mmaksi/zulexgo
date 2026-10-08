import { inspect } from "node:util"
import { ValidationError } from "@/src/core/errors/validation-error"
import { parseEvbNumber } from "./evb-number"

describe("parseEvbNumber", () => {
  it("takes seven letters and digits, tidied like the funnel tidies them", () => {
    expect(parseEvbNumber("9ABC12D").reveal()).toBe("9ABC12D")
    expect(parseEvbNumber("  9abc12d ").reveal()).toBe("9ABC12D")
  })

  it("leaves out the letters I and O, which the insurers never issue", () => {
    expect(() => parseEvbNumber("9ABC12I")).toThrow(ValidationError)
    expect(() => parseEvbNumber("9ABC12O")).toThrow(ValidationError)
    // Typed in lower case, they are the same letters once tidied.
    expect(() => parseEvbNumber("9abc12i")).toThrow(ValidationError)
    expect(parseEvbNumber("9ABC12J").reveal()).toBe("9ABC12J")
  })

  it.each(["", "9ABC12", "9ABC12DE"])("refuses %p, which is not seven characters", (input) => {
    expect(() => parseEvbNumber(input)).toThrow(ValidationError)
  })

  // The API's own pattern is not anchored, so it would accept a valid number inside a longer string.
  it.each(["XX9ABC12DXX", "9ABC12D-", "9ABC 12D"])("refuses %p, which only contains a valid number", (input) => {
    expect(() => parseEvbNumber(input)).toThrow(ValidationError)
  })

  // Upper-casing turns ß into SS and ſ into S, so a seven-character result could come from a character that is not a letter of the alphabet.
  it.each(["ABCDEß", "ABCDEFſ", "ABCDEFﬀ", "ÄBCDEFG"])("refuses %p, whose upper case is not what was typed", (input) => {
    expect(() => parseEvbNumber(input)).toThrow(ValidationError)
  })

  it("names the field and never carries the rejected value", () => {
    let error: unknown
    try {
      parseEvbNumber("9ABC12I")
    } catch (caught) {
      error = caught
    }

    expect(error).toEqual(new ValidationError(["evbNumber"]))
    expect(inspect(error)).not.toContain("9ABC12I")
  })

  it("prints a placeholder wherever it is turned into text", () => {
    const evb = parseEvbNumber("9ABC12D")

    expect(`${evb} ${JSON.stringify({ evb })} ${inspect({ evb })}`).not.toContain("9ABC12D")
  })
})
