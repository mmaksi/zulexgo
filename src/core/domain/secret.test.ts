import { inspect } from "node:util"
import { z } from "zod"
import { Secret, secret } from "./secret"
import { SecurityCode } from "./vehicle/security-code"

const VALUE = "DE89370400440532013000"

describe("Secret", () => {
  it("gives the value back only through reveal()", () => {
    expect(new Secret(VALUE, "IBAN").reveal()).toBe(VALUE)
  })

  it("holds a whole object, such as an address, the same way", () => {
    const address = { street: "Musterstrasse", houseNumber: "12a" }

    expect(new Secret(address, "address").reveal()).toEqual(address)
  })

  describe("never reveals itself by accident", () => {
    const iban = new Secret(VALUE, "IBAN")
    const address = new Secret({ street: "Musterstrasse" }, "address")
    const nested = { request: { iban, address } }

    it.each([
      ["String()", () => String(iban)],
      ["a template literal", () => `iban: ${iban}`],
      ["JSON.stringify", () => JSON.stringify(iban)],
      ["JSON.stringify of a containing object", () => JSON.stringify(nested)],
      ["util.inspect, which console.log uses", () => inspect(iban)],
      ["util.inspect of a containing object", () => inspect(nested, { depth: null })],
    ])("through %s", (_, render) => {
      expect(render()).not.toContain(VALUE)
      expect(render()).not.toContain("Musterstrasse")
    })

    it("names what it hides, so a log line still says which field it was", () => {
      expect(String(iban)).toBe("[redacted IBAN]")
      expect(JSON.stringify(address)).toBe('"[redacted address]"')
    })

    it("cannot be read by spreading or listing its keys", () => {
      expect(Object.keys(iban)).toEqual([])
      expect(JSON.stringify({ ...iban })).toBe("{}")
    })
  })
})

describe("secret()", () => {
  it("turns a schema's output into a Secret, so a field is secret by how it is parsed", () => {
    const parsed = secret(z.string().trim().min(1), "birth place").parse("  Musterstadt ")

    expect(parsed).toBeInstanceOf(Secret)
    expect(parsed.reveal()).toBe("Musterstadt")
  })

  it("still rejects what the schema rejects", () => {
    expect(secret(z.string().min(1), "birth place").safeParse("").success).toBe(false)
  })
})

// Guards jest.setup.ts's equality tester: without it toEqual cannot see a private field.
describe("comparing secrets in a test", () => {
  it("tells secrets with different values apart", () => {
    expect(new Secret("DE89370400440532013000", "IBAN")).not.toEqual(new Secret("DE02120300000000202051", "IBAN"))
    expect({ request: { iban: new Secret("a", "IBAN") } }).not.toEqual({ request: { iban: new Secret("b", "IBAN") } })
    expect([new Secret({ street: "Beispielstraße" }, "address")]).not.toEqual([new Secret({ street: "Andere Straße" }, "address")])
  })

  it("treats secrets with the same value as equal", () => {
    expect(new Secret("a", "IBAN")).toEqual(new Secret("a", "IBAN"))
    expect({ address: new Secret({ street: "Beispielstraße" }, "address") }).toEqual({ address: new Secret({ street: "Beispielstraße" }, "address") })
    expect(new Secret("a", "IBAN")).toStrictEqual(new Secret("a", "IBAN"))
  })

  it("does not mistake a secret for a plain value that merely has the same text", () => {
    expect(new Secret("a", "IBAN")).not.toEqual("a")
    expect(new Secret("a", "IBAN")).not.toEqual({})
  })

  it("does the same for a security code, which hides its value the same way", () => {
    expect(SecurityCode.parse("rearPlate", "AB1")).not.toEqual(SecurityCode.parse("rearPlate", "AB2"))
    expect(SecurityCode.parse("rearPlate", "AB1")).toEqual(SecurityCode.parse("rearPlate", "AB1"))
    expect(SecurityCode.parse("rearPlate", "AB1")).not.toEqual(SecurityCode.parse("frontPlate", "AB1"))
  })
})
