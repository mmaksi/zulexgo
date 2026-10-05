import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { ValidationError } from "@/src/core/errors/validation-error"
import { applyCorrection, parseCorrection } from "./correction"
import { parseDeregistrationRequest } from "./deregistration-request"

const twoPlates = parseDeregistrationRequest(FAKE_REQUEST)
const onePlate = parseDeregistrationRequest({ ...FAKE_REQUEST, plateCount: 1, codes: { rearPlate: "AA1", certificate: "AAAAAA1" } })

const fieldsRejected = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    if (error instanceof ValidationError) return error.fields
    throw error
  }
  throw new Error("expected a ValidationError")
}

describe("parseCorrection", () => {
  it("keeps only what the customer filled in, tidied like the funnel tidies it", () => {
    const correction = parseCorrection({ vin: " fakevin0000000009 ", rearPlate: "", frontPlate: "  ", certificate: "AAAAAA9" }, 2)

    expect(correction.vin).toBe("FAKEVIN0000000009")
    expect(correction.codes?.certificate?.reveal()).toBe("AAAAAA9")
    expect(correction.codes?.rearPlate).toBeUndefined()
    expect(correction.codes?.frontPlate).toBeUndefined()
    expect(correction.licencePlate).toBeUndefined()
  })

  it("asks for at least one change", () => {
    expect(fieldsRejected(() => parseCorrection({ vin: "", rearPlate: " " }, 2))).toEqual(["correction"])
    expect(fieldsRejected(() => parseCorrection({}, 1))).toEqual(["correction"])
  })

  it("names every field that is wrong, and never a value", () => {
    const wrong = () => parseCorrection({ vin: "not a vin!", rearPlate: "ab", certificate: "AAAAAA9" }, 2)

    expect(fieldsRejected(wrong)).toEqual(["vin", "rearPlate"])
    expect(() => wrong()).toThrow(expect.not.objectContaining({ message: expect.stringMatching(/ab|not a vin/) }))
  })

  it("refuses a front code for a vehicle with one plate, which has none to correct", () => {
    expect(fieldsRejected(() => parseCorrection({ frontPlate: "AA2" }, 1))).toEqual(["frontPlate"])
  })

  it("refuses codes of the wrong length", () => {
    expect(fieldsRejected(() => parseCorrection({ certificate: "AAAAAA" }, 2))).toEqual(["certificate"])
    expect(fieldsRejected(() => parseCorrection({ rearPlate: "AAAA" }, 2))).toEqual(["rearPlate"])
  })
})

describe("applyCorrection", () => {
  it("changes only the corrected fields", () => {
    const corrected = applyCorrection(twoPlates, parseCorrection({ vin: "FAKEVIN0000000009", frontPlate: "ZZ9" }, 2))

    expect(corrected.vin).toBe("FAKEVIN0000000009")
    expect(corrected.codes.frontPlate?.reveal()).toBe("ZZ9")
    expect(corrected.codes.rearPlate.reveal()).toBe(FAKE_REQUEST.codes.rearPlate)
    expect(corrected.codes.certificate.reveal()).toBe(FAKE_REQUEST.codes.certificate)
    expect(corrected.licencePlate).toEqual(twoPlates.licencePlate)
    expect(corrected.plateCount).toBe(2)
  })

  it("leaves a one-plate vehicle without a front code", () => {
    const corrected = applyCorrection(onePlate, parseCorrection({ rearPlate: "ZZ9" }, 1))

    expect(corrected.plateCount).toBe(1)
    expect(corrected.codes.frontPlate).toBeUndefined()
    expect(corrected.codes.rearPlate.reveal()).toBe("ZZ9")
  })

  it("does not change the request it was given", () => {
    applyCorrection(twoPlates, parseCorrection({ certificate: "AAAAAA9" }, 2))

    expect(twoPlates.codes.certificate.reveal()).toBe(FAKE_REQUEST.codes.certificate)
  })
})
