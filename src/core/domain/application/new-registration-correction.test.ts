import { inspect } from "node:util"
import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW as NOW } from "@/tests/fixtures/new-registration"
import { ValidationError } from "@/src/core/errors/validation-error"
import { applyNewRegistrationCorrection, parseNewRegistrationCorrection } from "./new-registration-correction"
import { parseNewRegistrationRequest } from "./new-registration-request"

describe("parseNewRegistrationCorrection (launch plan Q53 and Q47, provisional)", () => {
  const NEVER_VERIFIED = { identityVerified: false }
  const VERIFIED = { identityVerified: true }

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
      VERIFIED,
      NOW,
    )

    expect(correction.evbNumber?.reveal()).toBe("FAKEEVC")
    expect(correction.part2Number).toBe("FAKE0002")
    expect(correction.part2SecurityCode).toBeUndefined()
    expect(correction.firstName).toBeUndefined()
  })

  it("takes the Teil II number and code, which the API can patch after filing", () => {
    const correction = parseNewRegistrationCorrection({ part2Number: "FAKE0002", part2SecurityCode: "NEWCODE" }, VERIFIED, NOW)

    expect(correction.part2SecurityCode?.reveal()).toBe("NEWCODE")
  })

  it("asks for at least one change", () => {
    expect(rejected(() => parseNewRegistrationCorrection({}, VERIFIED, NOW)).fields).toEqual(["correction"])
    expect(rejected(() => parseNewRegistrationCorrection({ evbNumber: " ", firstName: "" }, NEVER_VERIFIED, NOW)).fields).toEqual(["correction"])
  })

  it("names every field that is wrong, and never a value", () => {
    const wrong = () => parseNewRegistrationCorrection({ evbNumber: "FAKEEVI", part2Number: "A".repeat(21), part2SecurityCode: "NEWCODE" }, VERIFIED, NOW)

    expect(rejected(wrong).fields).toEqual(["evbNumber", "part2Number"])
    expect(inspect(rejected(wrong))).not.toMatch(/FAKEEVI|AAAAAAAAAAAAAAAAAAAAA/)
  })

  describe("the owner's name and birth date, only while the identity was never verified (Q47: after a verification mismatch)", () => {
    it("are taken while the identity was never verified", () => {
      const correction = parseNewRegistrationCorrection({ firstName: " Erika Maria ", lastName: "Mustermann", birthDate: "1990-05-18" }, NEVER_VERIFIED, NOW)

      expect(correction.firstName).toBe("Erika Maria")
      expect(correction.lastName).toBe("Mustermann")
      expect(correction.birthDate?.reveal()).toBe("1990-05-18")
    })

    it.each(["firstName", "lastName", "birthDate"] as const)("refuse %s once the identity was verified, since the person was checked against the name and the API cannot patch the owner", (field) => {
      const value = field === "birthDate" ? "1990-05-18" : "Maria"

      expect(rejected(() => parseNewRegistrationCorrection({ [field]: value }, VERIFIED, NOW)).fields).toEqual([field])
    })

    it("still take the eVB and the Teil II alongside, while the identity was never verified", () => {
      expect(parseNewRegistrationCorrection({ evbNumber: "FAKEEVC", firstName: "Maria" }, NEVER_VERIFIED, NOW).evbNumber?.reveal()).toBe("FAKEEVC")
    })

    it("must still be of age, on the day of the correction", () => {
      expect(rejected(() => parseNewRegistrationCorrection({ birthDate: "2020-01-01" }, NEVER_VERIFIED, NOW)).fields).toEqual(["birthDate"])
      expect(rejected(() => parseNewRegistrationCorrection({ birthDate: "1990-02-30" }, NEVER_VERIFIED, NOW)).fields).toEqual(["birthDate"])
    })
  })
})

describe("applyNewRegistrationCorrection", () => {
  const request = parseNewRegistrationRequest(FAKE_NEW_REGISTRATION, NOW)

  it("changes only the corrected fields", () => {
    const corrected = applyNewRegistrationCorrection(
      request,
      parseNewRegistrationCorrection({ evbNumber: "FAKEEVC", part2SecurityCode: "NEWCODE", lastName: "Musterfrau" }, { identityVerified: false }, NOW),
    )

    expect(corrected.evbNumber.reveal()).toBe("FAKEEVC")
    expect(corrected.registrationCertificate.securityCode.reveal()).toBe("NEWCODE")
    expect(corrected.registrationCertificate.number).toBe(FAKE_NEW_REGISTRATION.registrationCertificate.number)
    expect(corrected.owner.lastName).toBe("Musterfrau")
    expect(corrected.owner.firstName).toBe("Erika")
    expect(corrected.owner.birthDate.reveal()).toBe(FAKE_NEW_REGISTRATION.owner.birthDate)
    expect(corrected.owner.address.reveal()).toEqual(FAKE_NEW_REGISTRATION.owner.address)
    expect(corrected.bankAccount?.reveal().iban).toBe(FAKE_NEW_REGISTRATION.bankAccount.iban)
    expect(corrected.vin).toBe(request.vin)
    expect(corrected.service).toBe("newRegistration")
  })

  it("corrects the birth date and the Teil II number", () => {
    const corrected = applyNewRegistrationCorrection(
      request,
      parseNewRegistrationCorrection({ birthDate: "1990-05-18", part2Number: "FAKE0002" }, { identityVerified: false }, NOW),
    )

    expect(corrected.owner.birthDate.reveal()).toBe("1990-05-18")
    expect(corrected.registrationCertificate.number).toBe("FAKE0002")
  })

  it("does not change the request it was given", () => {
    applyNewRegistrationCorrection(request, parseNewRegistrationCorrection({ evbNumber: "FAKEEVC", firstName: "Maria" }, { identityVerified: false }, NOW))

    expect(request.evbNumber.reveal()).toBe(FAKE_NEW_REGISTRATION.evbNumber)
    expect(request.owner.firstName).toBe("Erika")
  })

  it("keeps every secret hidden in what it returns", () => {
    const corrected = applyNewRegistrationCorrection(request, parseNewRegistrationCorrection({ evbNumber: "FAKEEVC", birthDate: "1990-05-18" }, { identityVerified: false }, NOW))
    const text = JSON.stringify(corrected) + inspect(corrected, { depth: null })

    for (const secret of ["FAKEEVC", "1990-05-18", FAKE_NEW_REGISTRATION.owner.address.street, FAKE_NEW_REGISTRATION.bankAccount.iban]) expect(text).not.toContain(secret)
  })
})
