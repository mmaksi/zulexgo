import { inspect } from "node:util"
import { FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW as NOW } from "@/tests/fixtures/new-registration"
import { ValidationError } from "@/src/core/errors/validation-error"
import { applyCorrection, applyNewRegistrationCorrection, parseCorrection, parseNewRegistrationCorrection } from "./correction"
import { parseDeregistrationRequest } from "./deregistration-request"
import { parseNewRegistrationRequest } from "./new-registration-request"

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

describe("parseNewRegistrationCorrection (launch plan Q53 and Q47, provisional)", () => {
  const BEFORE_FILING = { filed: false }
  const AFTER_FILING = { filed: true }

  const rejected = (run: () => unknown) => {
    try {
      run()
    } catch (error) {
      if (error instanceof ValidationError) return error
      throw error
    }
    throw new Error("expected a ValidationError")
  }

  it("keeps only what the customer filled in, tidied like the funnel tidies it", () => {
    const correction = parseNewRegistrationCorrection(
      { evbNumber: " fakeevc ", part2Number: " FAKE0002 ", part2SecurityCode: "  ", firstName: "" },
      AFTER_FILING,
      NOW,
    )

    expect(correction.evbNumber?.reveal()).toBe("FAKEEVC")
    expect(correction.part2Number).toBe("FAKE0002")
    expect(correction.part2SecurityCode).toBeUndefined()
    expect(correction.firstName).toBeUndefined()
  })

  it("takes the Teil II number and code, which the API can patch after filing", () => {
    const correction = parseNewRegistrationCorrection({ part2Number: "FAKE0002", part2SecurityCode: "NEWCODE" }, AFTER_FILING, NOW)

    expect(correction.part2SecurityCode?.reveal()).toBe("NEWCODE")
  })

  it("asks for at least one change", () => {
    expect(rejected(() => parseNewRegistrationCorrection({}, AFTER_FILING, NOW)).fields).toEqual(["correction"])
    expect(rejected(() => parseNewRegistrationCorrection({ evbNumber: " ", firstName: "" }, BEFORE_FILING, NOW)).fields).toEqual(["correction"])
  })

  it("names every field that is wrong, and never a value", () => {
    const wrong = () => parseNewRegistrationCorrection({ evbNumber: "FAKEEVI", part2Number: "A".repeat(21), part2SecurityCode: "NEWCODE" }, AFTER_FILING, NOW)

    expect(rejected(wrong).fields).toEqual(["evbNumber", "part2Number"])
    expect(inspect(rejected(wrong))).not.toMatch(/FAKEEVI|AAAAAAAAAAAAAAAAAAAAA/)
  })

  describe("the owner's name and birth date, only before anything is filed (Q47: after a verification mismatch)", () => {
    it("are taken before filing", () => {
      const correction = parseNewRegistrationCorrection({ firstName: " Erika Maria ", lastName: "Mustermann", birthDate: "1990-05-18" }, BEFORE_FILING, NOW)

      expect(correction.firstName).toBe("Erika Maria")
      expect(correction.lastName).toBe("Mustermann")
      expect(correction.birthDate?.reveal()).toBe("1990-05-18")
    })

    it.each(["firstName", "lastName", "birthDate"] as const)("refuse %s once filed, since the API cannot patch the owner", (field) => {
      const value = field === "birthDate" ? "1990-05-18" : "Maria"

      expect(rejected(() => parseNewRegistrationCorrection({ [field]: value }, AFTER_FILING, NOW)).fields).toEqual([field])
    })

    it("still take the eVB and the Teil II alongside, before filing", () => {
      expect(parseNewRegistrationCorrection({ evbNumber: "FAKEEVC", firstName: "Maria" }, BEFORE_FILING, NOW).evbNumber?.reveal()).toBe("FAKEEVC")
    })

    it("must still be of age, on the day of the correction", () => {
      expect(rejected(() => parseNewRegistrationCorrection({ birthDate: "2020-01-01" }, BEFORE_FILING, NOW)).fields).toEqual(["birthDate"])
      expect(rejected(() => parseNewRegistrationCorrection({ birthDate: "1990-02-30" }, BEFORE_FILING, NOW)).fields).toEqual(["birthDate"])
    })
  })
})

describe("applyNewRegistrationCorrection", () => {
  const request = parseNewRegistrationRequest(FAKE_NEW_REGISTRATION, NOW)

  it("changes only the corrected fields", () => {
    const corrected = applyNewRegistrationCorrection(
      request,
      parseNewRegistrationCorrection({ evbNumber: "FAKEEVC", part2SecurityCode: "NEWCODE", lastName: "Musterfrau" }, { filed: false }, NOW),
    )

    expect(corrected.evbNumber.reveal()).toBe("FAKEEVC")
    expect(corrected.registrationCertificate.securityCode.reveal()).toBe("NEWCODE")
    expect(corrected.registrationCertificate.number).toBe(FAKE_NEW_REGISTRATION.registrationCertificate.number)
    expect(corrected.owner.lastName).toBe("Musterfrau")
    expect(corrected.owner.firstName).toBe("Erika")
    expect(corrected.owner.birthDate.reveal()).toBe(FAKE_NEW_REGISTRATION.owner.birthDate)
    expect(corrected.owner.address.reveal()).toEqual(FAKE_NEW_REGISTRATION.owner.address)
    expect(corrected.bankAccount.reveal().iban).toBe(FAKE_NEW_REGISTRATION.bankAccount.iban)
    expect(corrected.vin).toBe(request.vin)
    expect(corrected.service).toBe("newRegistration")
  })

  it("corrects the birth date and the Teil II number", () => {
    const corrected = applyNewRegistrationCorrection(
      request,
      parseNewRegistrationCorrection({ birthDate: "1990-05-18", part2Number: "FAKE0002" }, { filed: false }, NOW),
    )

    expect(corrected.owner.birthDate.reveal()).toBe("1990-05-18")
    expect(corrected.registrationCertificate.number).toBe("FAKE0002")
  })

  it("does not change the request it was given", () => {
    applyNewRegistrationCorrection(request, parseNewRegistrationCorrection({ evbNumber: "FAKEEVC", firstName: "Maria" }, { filed: false }, NOW))

    expect(request.evbNumber.reveal()).toBe(FAKE_NEW_REGISTRATION.evbNumber)
    expect(request.owner.firstName).toBe("Erika")
  })

  it("keeps every secret hidden in what it returns", () => {
    const corrected = applyNewRegistrationCorrection(request, parseNewRegistrationCorrection({ evbNumber: "FAKEEVC", birthDate: "1990-05-18" }, { filed: false }, NOW))
    const text = JSON.stringify(corrected) + inspect(corrected, { depth: null })

    for (const secret of ["FAKEEVC", "1990-05-18", FAKE_NEW_REGISTRATION.owner.address.street, FAKE_NEW_REGISTRATION.bankAccount.iban]) expect(text).not.toContain(secret)
  })
})
