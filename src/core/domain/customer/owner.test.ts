import { inspect } from "node:util"
import { ValidationError } from "@/src/core/errors/validation-error"
import { validate } from "@/src/core/domain/validate"
import { ownerSchema } from "./owner"

const parseOwner = (input: unknown, now: Date) => validate(ownerSchema(now), input, "owner")

const NOW = new Date("2026-03-15T10:00:00.000Z")

const valid = {
  firstName: "Erika",
  lastName: "Mustermann",
  gender: "female",
  birthDate: "1990-05-17",
  birthPlace: "Musterstadt",
  phone: "+49 151 2345678",
  email: "erika.mustermann@example.test",
  address: { street: "Beispielstraße", houseNumber: "12a", postcode: "10115", city: "Berlin" },
}

const fieldsRejected = (input: unknown, now = NOW) => {
  try {
    parseOwner(input, now)
  } catch (error) {
    if (error instanceof ValidationError) return error.fields
    throw error
  }
  throw new Error("expected a ValidationError")
}

describe("parseOwner: the keeper the car is registered to", () => {
  it("keeps the details, tidied, and hides the personal ones", () => {
    const owner = parseOwner({ ...valid, firstName: " Erika ", email: " Erika.Mustermann@Example.test " }, NOW)

    expect(owner.firstName).toBe("Erika")
    expect(owner.lastName).toBe("Mustermann")
    expect(owner.gender).toBe("female")
    expect(owner.email).toBe("erika.mustermann@example.test")
    expect(owner.birthDate.reveal()).toBe("1990-05-17")
    expect(owner.birthPlace.reveal()).toBe("Musterstadt")
    expect(owner.phone.reveal()).toBe("+49 151 2345678")
    expect(owner.address.reveal()).toEqual(valid.address)
  })

  it.each(["female", "male", "diverse", "unspecified"])("accepts the gender %s", (gender) => {
    expect(parseOwner({ ...valid, gender }, NOW).gender).toBe(gender)
  })

  it.each(["", "FEMALE", "other", undefined])("refuses the gender %p", (gender) => {
    expect(fieldsRejected({ ...valid, gender })).toEqual(["gender"])
  })

  it.each(["firstName", "lastName", "birthPlace"] as const)("needs a %s", (field) => {
    expect(fieldsRejected({ ...valid, [field]: "  " })).toEqual([field])
    expect(fieldsRejected({ ...valid, [field]: undefined })).toEqual([field])
  })

  it.each(["", "not an email", "erika@", "erika mustermann@example.test"])("refuses the email %p", (email) => {
    expect(fieldsRejected({ ...valid, email })).toEqual(["email"])
  })

  describe("the phone number", () => {
    it.each(["+49 151 2345678", "0151/2345678", "(030) 1234567", "030-1234567", "004915123456789"])("accepts %p", (phone) => {
      expect(parseOwner({ ...valid, phone }, NOW).phone.reveal()).toBe(phone)
    })

    it.each(["", "abc", "12345", "1234567890123456", "0151 234 5678 ext 12", "+"])("refuses %p", (phone) => {
      expect(fieldsRejected({ ...valid, phone })).toEqual(["phone"])
    })
  })

  it("names the address part that is wrong, under the owner's own path", () => {
    expect(fieldsRejected({ ...valid, address: { ...valid.address, postcode: "1011" } })).toEqual(["address.postcode"])
  })

  describe("the birth date", () => {
    it.each(["1990-05-17", "1990-02-28", "1992-02-29"])("accepts %s", (birthDate) => {
      expect(parseOwner({ ...valid, birthDate }, NOW).birthDate.reveal()).toBe(birthDate)
    })

    it.each(["", "17.05.1990", "1990-5-17", "1990-05-17T00:00:00Z", "1990-13-01", "1990-02-30", "1990-00-10", "1991-02-29", "not a date"])(
      "refuses %p, which is not a date written year-month-day",
      (birthDate) => {
        expect(fieldsRejected({ ...valid, birthDate })).toEqual(["birthDate"])
      },
    )

    it("refuses a date in the future", () => {
      expect(fieldsRejected({ ...valid, birthDate: "2026-03-16" })).toEqual(["birthDate"])
    })

    describe("must be 18 or over, the day counted in Germany (launch plan Q49: private persons of age)", () => {
      it("accepts someone whose 18th birthday is today", () => {
        expect(parseOwner({ ...valid, birthDate: "2008-03-15" }, NOW).birthDate.reveal()).toBe("2008-03-15")
      })

      it("refuses someone whose 18th birthday is tomorrow", () => {
        expect(fieldsRejected({ ...valid, birthDate: "2008-03-16" })).toEqual(["birthDate"])
      })

      it("accepts someone who turned 18 yesterday, and refuses a 17-year-old", () => {
        expect(parseOwner({ ...valid, birthDate: "2008-03-14" }, NOW).birthDate.reveal()).toBe("2008-03-14")
        expect(fieldsRejected({ ...valid, birthDate: "2009-03-15" })).toEqual(["birthDate"])
      })

      it("counts the day in Berlin, so a birthday begins at midnight there, not at midnight UTC (winter)", () => {
        const justAfterMidnightInBerlin = new Date("2026-03-14T23:30:00.000Z")
        const justBeforeMidnightInBerlin = new Date("2026-03-14T22:30:00.000Z")

        expect(parseOwner({ ...valid, birthDate: "2008-03-15" }, justAfterMidnightInBerlin).birthDate.reveal()).toBe("2008-03-15")
        expect(fieldsRejected({ ...valid, birthDate: "2008-03-15" }, justBeforeMidnightInBerlin)).toEqual(["birthDate"])
      })

      it("counts the day in Berlin in summer time too", () => {
        const justAfterMidnightInBerlin = new Date("2026-07-14T22:30:00.000Z")
        const justBeforeMidnightInBerlin = new Date("2026-07-14T21:30:00.000Z")

        expect(parseOwner({ ...valid, birthDate: "2008-07-15" }, justAfterMidnightInBerlin).birthDate.reveal()).toBe("2008-07-15")
        expect(fieldsRejected({ ...valid, birthDate: "2008-07-15" }, justBeforeMidnightInBerlin)).toEqual(["birthDate"])
      })

      it("lets someone born on 29 February in from 1 March in a year that has no 29 February", () => {
        const feb28 = new Date("2026-02-28T12:00:00.000Z")
        const mar1 = new Date("2026-03-01T12:00:00.000Z")

        expect(fieldsRejected({ ...valid, birthDate: "2008-02-29" }, feb28)).toEqual(["birthDate"])
        expect(parseOwner({ ...valid, birthDate: "2008-02-29" }, mar1).birthDate.reveal()).toBe("2008-02-29")
      })
    })
  })

  it("names every wrong field at once", () => {
    expect(fieldsRejected({ ...valid, firstName: "", birthDate: "2020-01-01", phone: "x" })).toEqual(["firstName", "birthDate", "phone"])
  })

  it("never reveals the personal details when turned into text, only the names and the email", () => {
    const text = `${JSON.stringify(parseOwner(valid, NOW))} ${inspect(parseOwner(valid, NOW), { depth: null })}`

    for (const secret of ["1990-05-17", "Musterstadt", "151 2345678", "Beispielstraße", "10115", "12a"]) expect(text).not.toContain(secret)
    expect(text).toContain("Mustermann")
  })
})
