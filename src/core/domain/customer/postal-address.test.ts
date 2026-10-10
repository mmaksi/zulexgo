import { ValidationError } from "@/src/core/errors/validation-error"
import { validate } from "@/src/core/domain/validate"
import { postalAddressSchema } from "./postal-address"

const parsePostalAddress = (input: unknown) => validate(postalAddressSchema, input, "address")

const valid = { street: "Beispielstraße", houseNumber: "12a", postcode: "10115", city: "Berlin" }

const fieldsRejected = (input: unknown) => {
  try {
    parsePostalAddress(input)
  } catch (error) {
    if (error instanceof ValidationError) return error.fields
    throw error
  }
  throw new Error("expected a ValidationError")
}

describe("parsePostalAddress: a German address, as the API takes it", () => {
  it("keeps the parts, trimmed", () => {
    expect(parsePostalAddress({ street: " Beispielstraße ", houseNumber: " 12a ", postcode: " 10115 ", city: " Berlin " })).toEqual(valid)
  })

  it.each(["1", "12", "12a", "12 a", "1-3", "9999", "7/2"])("accepts the house number %p", (houseNumber) => {
    expect(parsePostalAddress({ ...valid, houseNumber }).houseNumber).toBe(houseNumber)
  })

  it.each(["", "a12", "abc", "12345", "-1"])("refuses the house number %p", (houseNumber) => {
    expect(fieldsRejected({ ...valid, houseNumber })).toEqual(["houseNumber"])
  })

  it.each(["01067", "99998"])("accepts the postcode %s", (postcode) => {
    expect(parsePostalAddress({ ...valid, postcode }).postcode).toBe(postcode)
  })

  it.each(["", "1011", "101155", "1011a", "10 115", "D-10115"])("refuses the postcode %p", (postcode) => {
    expect(fieldsRejected({ ...valid, postcode })).toEqual(["postcode"])
  })

  it.each(["street", "city"] as const)("needs a %s", (field) => {
    expect(fieldsRejected({ ...valid, [field]: "   " })).toEqual([field])
    expect(fieldsRejected({ ...valid, [field]: undefined })).toEqual([field])
  })

  it("names every wrong part at once, each with its own path", () => {
    expect(fieldsRejected({ street: "", houseNumber: "x", postcode: "1", city: "" })).toEqual(["street", "houseNumber", "postcode", "city"])
  })
})
