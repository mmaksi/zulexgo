import { inspect } from "node:util"
import { FAKE_NEW_REGISTRATION as FAKE, FAKE_NEW_REGISTRATION_NOW as NOW } from "@/tests/fixtures/new-registration"
import { ValidationError } from "@/src/core/errors/validation-error"
import { parseNewRegistrationRequest, parseStoredNewRegistrationRequest, withoutBankAccount } from "./new-registration-request"

const fieldsRejected = (input: unknown, now = NOW) => {
  try {
    parseNewRegistrationRequest(input, now)
  } catch (error) {
    if (error instanceof ValidationError) return error.fields
    throw error
  }
  throw new Error("expected a ValidationError")
}

const without = (field: string) => Object.fromEntries(Object.entries(FAKE).filter(([key]) => key !== field))

describe("parseNewRegistrationRequest", () => {
  it("accepts every field the API's create request needs, and names its service", () => {
    const request = parseNewRegistrationRequest(FAKE, NOW)

    expect(request.service).toBe("newRegistration")
    expect(request.vin).toBe("FAKEVIN0000000002")
    expect(request.engineType).toBe("combustion")
    expect(request.evbNumber.reveal()).toBe("FAKEEVB")
    expect(request.registrationCertificate.number).toBe("FAKE0001")
    expect(request.registrationCertificate.securityCode.reveal()).toBe("FAKECODE")
    expect(request.owner.lastName).toBe("Mustermann")
    expect(request.owner.birthDate.reveal()).toBe("1990-05-17")
    expect(request.owner.address.reveal()).toEqual(FAKE.owner.address)
    expect(request.bankAccount.reveal()).toEqual({ ...FAKE.bankAccount, country: "DE" })
    expect(request.plate).toEqual({ electric: false })
  })

  it("takes a VIN of exactly 17 characters, which is what a new car has", () => {
    expect(parseNewRegistrationRequest({ ...FAKE, vin: "WVWZZZ1JZXW000001" }, NOW).vin).toBe("WVWZZZ1JZXW000001")
    expect(fieldsRejected({ ...FAKE, vin: "WVWZZZ1JZXW0000012" })).toEqual(["vin"])
  })

  it("tidies what the funnel tidies: the VIN and the eVB number are upper-cased", () => {
    const request = parseNewRegistrationRequest({ ...FAKE, vin: " fakevin0000000002 ", evbNumber: " fakeevb " }, NOW)

    expect(request.vin).toBe("FAKEVIN0000000002")
    expect(request.evbNumber.reveal()).toBe("FAKEEVB")
  })

  it("is an ordinary plate when the funnel sends no plate options", () => {
    expect(parseNewRegistrationRequest(without("plate"), NOW).plate).toEqual({ electric: false })
  })

  it("takes the service from itself, never from the browser, and drops what it does not know", () => {
    const request = parseNewRegistrationRequest({ ...FAKE, service: "deregistration", vehicleType: "MOTORCYCLE" }, NOW)

    expect(request.service).toBe("newRegistration")
    expect(request).not.toHaveProperty("vehicleType")
  })

  describe("refuses each broken field under its own path", () => {
    const owner = (change: object) => ({ ...FAKE, owner: { ...FAKE.owner, ...change } })
    const address = (change: object) => owner({ address: { ...FAKE.owner.address, ...change } })
    const bank = (change: object) => ({ ...FAKE, bankAccount: { ...FAKE.bankAccount, ...change } })
    const certificate = (change: object) => ({ ...FAKE, registrationCertificate: { ...FAKE.registrationCertificate, ...change } })

    it.each<[string, unknown]>([
      ["vin", { ...FAKE, vin: "not a vin!" }],
      // PATCH cannot change the VIN, so a dropped character would end the order: a new car's has 17.
      ["vin", { ...FAKE, vin: "FAKEVIN000000002" }],
      ["engineType", { ...FAKE, engineType: "NO_ENGINE" }],
      ["evbNumber", { ...FAKE, evbNumber: "FAKEEVI" }],
      ["registrationCertificate.number", certificate({ number: "" })],
      ["registrationCertificate.securityCode", certificate({ securityCode: "" })],
      ["owner.firstName", owner({ firstName: "" })],
      ["owner.lastName", owner({ lastName: "" })],
      ["owner.gender", owner({ gender: "other" })],
      ["owner.birthDate", owner({ birthDate: "1990-02-30" })],
      ["owner.birthPlace", owner({ birthPlace: "" })],
      ["owner.phone", owner({ phone: "abc" })],
      ["owner.email", owner({ email: "erika@" })],
      ["owner.address.street", address({ street: "" })],
      ["owner.address.houseNumber", address({ houseNumber: "a12" })],
      ["owner.address.postcode", address({ postcode: "1011" })],
      ["owner.address.city", address({ city: "" })],
      ["bankAccount.iban", bank({ iban: "DE89370400440532013001" })],
      ["bankAccount.bic", bank({ bic: "COBA" })],
      ["bankAccount.bankName", bank({ bankName: "" })],
      ["plate.seasonal.from", { ...FAKE, plate: { seasonal: { from: 0, until: 10 } } }],
      ["plate.seasonal.until", { ...FAKE, plate: { seasonal: { from: 4, until: 13 } } }],
    ])("%s", (path, input) => {
      expect(fieldsRejected(input)).toEqual([path])
    })

    it.each(["vin", "engineType", "evbNumber", "registrationCertificate", "owner", "bankAccount"] as const)("a missing %s", (field) => {
      expect(fieldsRejected(without(field))).toEqual([field])
    })

    it.each([undefined, null, "request", 42, []])("something that is not a request: %p", (input) => {
      expect(fieldsRejected(input)).toEqual(["request"])
    })

    it("names every broken field at once", () => {
      expect(fieldsRejected({ ...FAKE, vin: "", evbNumber: "", bankAccount: { ...FAKE.bankAccount, iban: "" } })).toEqual([
        "vin",
        "evbNumber",
        "bankAccount.iban",
      ])
    })
  })

  describe("the keeper must be 18 or over on the day of the order", () => {
    it("takes the day from the clock it is given", () => {
      const eighteenthBirthday = new Date("2026-03-15T10:00:00.000Z")
      const owner = { ...FAKE.owner, birthDate: "2008-03-15" }

      expect(parseNewRegistrationRequest({ ...FAKE, owner }, eighteenthBirthday).owner.birthDate.reveal()).toBe("2008-03-15")
      expect(fieldsRejected({ ...FAKE, owner }, new Date("2026-03-14T10:00:00.000Z"))).toEqual(["owner.birthDate"])
    })
  })

  describe("an E-plate is for an electric car only (launch plan Q49, provisional)", () => {
    it("is accepted for an electric car", () => {
      const request = parseNewRegistrationRequest({ ...FAKE, engineType: "electric", plate: { electric: true } }, NOW)

      expect(request.plate.electric).toBe(true)
    })

    it.each(["combustion", "hybrid"])("is refused for a %s car, under the plate's own path", (engineType) => {
      expect(fieldsRejected({ ...FAKE, engineType, plate: { electric: true } })).toEqual(["plate.electric"])
    })

    it("is not asked of an electric car that wants an ordinary plate", () => {
      expect(parseNewRegistrationRequest({ ...FAKE, engineType: "electric", plate: { electric: false } }, NOW).plate.electric).toBe(false)
    })

    it("goes with a seasonal plate on an electric car", () => {
      const plate = { electric: true, seasonal: { from: 4, until: 10 } }

      expect(parseNewRegistrationRequest({ ...FAKE, engineType: "electric", plate }, NOW).plate).toEqual(plate)
    })
  })

  describe("never reveals a secret by accident", () => {
    const request = parseNewRegistrationRequest(FAKE, NOW)
    const SECRETS = [
      FAKE.evbNumber,
      FAKE.registrationCertificate.securityCode,
      FAKE.owner.birthDate,
      FAKE.owner.birthPlace,
      FAKE.owner.phone,
      FAKE.owner.address.street,
      FAKE.owner.address.houseNumber,
      FAKE.owner.address.postcode,
      FAKE.bankAccount.iban,
      FAKE.bankAccount.bic,
      FAKE.bankAccount.bankName,
    ]

    it.each([
      ["JSON.stringify", () => JSON.stringify(request)],
      ["util.inspect, which console.log uses", () => inspect(request, { depth: null })],
      ["a template literal of each secret field", () => `${request.evbNumber} ${request.owner.birthDate} ${request.owner.address} ${request.bankAccount}`],
    ])("through %s", (_, render) => {
      const text = render()

      for (const secret of SECRETS) expect(text).not.toContain(secret)
    })

    it("and what it keeps in the open is the vehicle, the Teil II number and the owner's name", () => {
      const text = JSON.stringify(request)

      expect(text).toContain(FAKE.vin)
      expect(text).toContain(FAKE.registrationCertificate.number)
      expect(text).toContain(FAKE.owner.lastName)
    })

    it("and a rejected value never comes back in the error", () => {
      let error: unknown
      try {
        parseNewRegistrationRequest({ ...FAKE, bankAccount: { ...FAKE.bankAccount, iban: "DE89370400440532013001" } }, NOW)
      } catch (caught) {
        error = caught
      }

      expect(inspect(error)).not.toContain("DE89370400440532013001")
    })
  })
})

// Launch plan Q54: the bank account is held only until the order ends, so a stored order may lack it where a checkout may not.
describe("an order's request once its bank account is gone", () => {
  const stored = () => parseStoredNewRegistrationRequest(without("bankAccount"), NOW)

  it("reads back without a bank account, every other field kept", () => {
    const request = stored()

    expect(request.bankAccount).toBeUndefined()
    expect(request.vin).toBe(FAKE.vin)
    expect(request.evbNumber.reveal()).toBe(FAKE.evbNumber)
    expect(request.owner.address.reveal()).toEqual(FAKE.owner.address)
  })

  it("is what withoutBankAccount leaves of a complete request, and what it leaves out reads back as it was", () => {
    const ended = withoutBankAccount(parseNewRegistrationRequest(FAKE, NOW))

    expect(ended).not.toHaveProperty("bankAccount")
    expect(ended).toEqual(stored())
  })

  it("still refuses a bank account that is there but wrong, a stored order being validated like any request", () => {
    expect(() => parseStoredNewRegistrationRequest({ ...FAKE, bankAccount: { ...FAKE.bankAccount, iban: "DE89370400440532013001" } }, NOW)).toThrow(ValidationError)
  })
})
