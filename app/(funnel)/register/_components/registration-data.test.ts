import { FILLED_REGISTRATION_FORM as FILLED } from "@/tests/fixtures/registration-form"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import {
  EMPTY_REGISTRATION,
  fieldsOf,
  toRequest,
  validateFields,
  type RegistrationData,
  type RegistrationField,
  type TextualField,
} from "./registration-data"

const NOW = new Date("2026-03-01T09:00:00.000Z")

const withData = (changes: Partial<RegistrationData>): RegistrationData => ({ ...FILLED, ...changes })
const everyField = Object.keys(FILLED) as RegistrationField[]

describe("what the form sends", () => {
  it("is exactly what the server parses, so the form and the domain cannot drift apart", () => {
    expect(() => parseNewRegistrationRequest(toRequest(FILLED), NOW)).not.toThrow()
  })

  it("offers the E-plate only to an electric car, whatever was ticked before the engine changed", () => {
    expect(toRequest(withData({ engineType: "electric", electric: true })).plate).toEqual({ electric: true })
    expect(toRequest(withData({ engineType: "hybrid", electric: true })).plate).toEqual({ electric: false })
  })

  it("sends the season's months as numbers, and a season only when one was asked for", () => {
    expect(toRequest(withData({ seasonal: true, seasonFrom: "4", seasonUntil: "10" })).plate).toEqual({ electric: false, seasonal: { from: 4, until: 10 } })
    expect(toRequest(withData({ seasonal: false, seasonFrom: "4", seasonUntil: "10" })).plate).toEqual({ electric: false })
  })
})

describe("what each step asks for", () => {
  it("lists the season's months only once a season is asked for", () => {
    expect(fieldsOf("plate", FILLED)).toEqual([])
    expect(fieldsOf("plate", withData({ seasonal: true }))).toEqual(["seasonFrom", "seasonUntil"])
  })

  it("covers every field the form holds, once, except the two plate choices the plate step shows as toggles", () => {
    const asked = (["vehicle", "keeper", "plate", "tax"] as const).flatMap((step) => fieldsOf(step, withData({ seasonal: true })))

    expect([...asked].sort()).toEqual(everyField.filter((field) => field !== "electric" && field !== "seasonal").sort())
  })
})

describe("validating a step", () => {
  it("finds nothing wrong with a filled-in form", () => {
    for (const step of ["vehicle", "keeper", "plate", "tax"] as const) expect(validateFields(FILLED, fieldsOf(step, FILLED), NOW)).toEqual({})
  })

  it("names every empty field of the step, and no field of another step", () => {
    const errors = validateFields(EMPTY_REGISTRATION, fieldsOf("vehicle", EMPTY_REGISTRATION), NOW)

    expect(Object.keys(errors).sort()).toEqual(["engineType", "evbNumber", "part2Number", "part2SecurityCode", "vin"])
  })

  it.each<[TextualField, string, RegExp]>([
    ["vin", "FAKEVIN000000001", /17 Stellen/],
    ["evbNumber", "FAKEEVI", /eVB-Nummer/],
    ["evbNumber", "FAKEEVBX", /7 Zeichen/],
    ["engineType", "", /angetrieben/],
    ["houseNumber", "Haus", /Ziffer/],
    ["postcode", "1011", /5-stellige/],
    ["phone", "abc", /Telefonnummer/],
    ["email", "erika", /E-Mail-Adresse/],
    ["bic", "COBA", /BIC/],
  ])("explains a wrong %s (%j) in the customer's words", (field, value, message) => {
    const step = field === "vin" || field === "evbNumber" || field === "engineType" ? "vehicle" : field === "bic" ? "tax" : "keeper"

    const errors = validateFields(withData({ [field]: value }), fieldsOf(step, FILLED), NOW)

    expect(errors[field]).toMatch(message)
    expect(Object.keys(errors)).toEqual([field])
  })

  describe("the keeper's birth date, against the clock", () => {
    it.each([
      ["a day before the 18th birthday", "2008-03-02"],
      ["a date that does not exist", "1990-02-30"],
      ["nothing", ""],
    ])("refuses %s", (_, birthDate) => {
      expect(validateFields(withData({ birthDate }), ["birthDate"], NOW).birthDate).toMatch(/mindestens 18/)
    })

    it("accepts the 18th birthday itself", () => {
      expect(validateFields(withData({ birthDate: "2008-03-01" }), ["birthDate"], NOW)).toEqual({})
    })
  })

  describe("the IBAN", () => {
    it("says a wrong checksum is probably a typo", () => {
      expect(validateFields(withData({ iban: "DE00 3704 0044 0532 0130 00" }), ["iban"], NOW).iban).toMatch(/Tippfehler/)
    })

    it.each(["AT61 1904 3002 3457 3201", "DE89 3704 0044 0532 0130", "garbage", ""])("says only a German IBAN is taken, for %j", (iban) => {
      expect(validateFields(withData({ iban }), ["iban"], NOW).iban).toMatch(/beginnt mit DE und hat 22 Stellen/)
    })

    it("takes the IBAN as it is printed, with spaces and in any case", () => {
      expect(validateFields(withData({ iban: "de89 3704 0044 0532 0130 00" }), ["iban"], NOW)).toEqual({})
    })
  })

  describe("a seasonal plate", () => {
    it("asks for both months once a season is wanted", () => {
      const errors = validateFields(withData({ seasonal: true }), ["seasonFrom", "seasonUntil"], NOW)

      expect(Object.keys(errors).sort()).toEqual(["seasonFrom", "seasonUntil"])
    })

    it("takes any month from January to December", () => {
      expect(validateFields(withData({ seasonal: true, seasonFrom: "4", seasonUntil: "10" }), ["seasonFrom", "seasonUntil"], NOW)).toEqual({})
    })
  })
})
