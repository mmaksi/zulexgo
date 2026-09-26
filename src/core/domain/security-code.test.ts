import { inspect } from "node:util"
import { ValidationError } from "@/src/core/errors/validation-error"
import { SecurityCode } from "./security-code"

const PLATE_CODE = "Q7X"
const CERTIFICATE_CODE = "K9Z2W4M"

describe("SecurityCode", () => {
  it("takes three characters on a plate seal and seven on the registration certificate", () => {
    expect(SecurityCode.parse("rearPlate", PLATE_CODE).reveal()).toBe(PLATE_CODE)
    expect(SecurityCode.parse("frontPlate", PLATE_CODE).reveal()).toBe(PLATE_CODE)
    expect(SecurityCode.parse("certificate", CERTIFICATE_CODE).reveal()).toBe(CERTIFICATE_CODE)
  })

  it.each([
    ["rearPlate", CERTIFICATE_CODE],
    ["certificate", PLATE_CODE],
    ["rearPlate", "Q7-"],
  ] as const)("rejects a %s code of the wrong shape", (kind, raw) => {
    expect(() => SecurityCode.parse(kind, raw)).toThrow(ValidationError)
  })

  it("never echoes a rejected code in the error", () => {
    const rejected = "Q7X9"
    let error: unknown
    try {
      SecurityCode.parse("rearPlate", rejected)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ValidationError)
    expect(inspect(error)).not.toContain(rejected)
    expect(JSON.stringify(error)).not.toContain(rejected)
  })

  describe("never reveals itself by accident", () => {
    const code = SecurityCode.parse("certificate", CERTIFICATE_CODE)
    const nested = { application: { codes: { certificate: code } } }

    it.each([
      ["String()", () => String(code)],
      ["a template literal", () => `code: ${code}`],
      ["JSON.stringify", () => JSON.stringify(code)],
      ["JSON.stringify of a containing object", () => JSON.stringify(nested)],
      ["util.inspect, which console.log uses", () => inspect(code)],
      ["util.inspect of a containing object", () => inspect(nested, { depth: null })],
    ])("through %s", (_, render) => {
      expect(render()).not.toContain(CERTIFICATE_CODE)
    })
  })
})
