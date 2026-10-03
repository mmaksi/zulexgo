import { ValidationError } from "@/src/core/errors/validation-error"
import { parseDeregistrationRequest } from "./deregistration-request"

const car = {
  plateCount: 2,
  licencePlate: { prefix: "M", letters: "AB", numbers: "123" },
  vin: "WVWZZZ1JZXW000001",
  codes: { rearPlate: "Q7X", frontPlate: "R8Y", certificate: "K9Z2W4M" },
}

describe("parseDeregistrationRequest", () => {
  it("takes a front plate code for a two-plate vehicle", () => {
    expect(parseDeregistrationRequest(car).codes.frontPlate?.reveal()).toBe("R8Y")
  })

  it("requires the front plate code when there are two plates", () => {
    const codes = { rearPlate: car.codes.rearPlate, certificate: car.codes.certificate }

    expect(() => parseDeregistrationRequest({ ...car, codes })).toThrow(
      expect.objectContaining({ fields: ["codes.frontPlate"] }),
    )
  })

  it("never carries a front plate code for a one-plate vehicle, so the API is not sent one", () => {
    const motorcycle = parseDeregistrationRequest({ ...car, plateCount: 1 })

    expect(motorcycle.codes.frontPlate).toBeUndefined()
  })

  it("reports every invalid field at once, by name only", () => {
    const invalid = { ...car, vin: "", codes: { ...car.codes, certificate: "K9Z" } }

    expect(() => parseDeregistrationRequest(invalid)).toThrow(ValidationError)
    expect(() => parseDeregistrationRequest(invalid)).toThrow(
      expect.objectContaining({ fields: ["vin", "codes.certificate"] }),
    )
  })
})
