import { inspect } from "node:util"
import { ValidationError } from "@/src/core/errors/validation-error"
import { parseBankAccount } from "./bank-account"

// Published example IBANs (checksums verified independently of the code under test).
const VALID_IBANS = ["DE89370400440532013000", "DE02120300000000202051", "DE75512108001245126199"]
const valid = { iban: "DE89370400440532013000", bic: "COBADEFFXXX", bankName: "Beispielbank" }

const fieldsRejected = (input: unknown) => {
  try {
    parseBankAccount(input)
  } catch (error) {
    if (error instanceof ValidationError) return error.fields
    throw error
  }
  throw new Error("expected a ValidationError")
}

describe("parseBankAccount: the account the vehicle tax is collected from", () => {
  it("keeps the details, and takes the country from the IBAN", () => {
    expect(parseBankAccount(valid)).toEqual({ ...valid, country: "DE" })
  })

  describe("the IBAN", () => {
    it.each(VALID_IBANS)("accepts %s", (iban) => {
      expect(parseBankAccount({ ...valid, iban }).iban).toBe(iban)
    })

    it("is tidied: spaces dropped, upper case", () => {
      expect(parseBankAccount({ ...valid, iban: " de89 3704 0044 0532 0130 00 " }).iban).toBe("DE89370400440532013000")
    })

    // One wrong digit, and two digits swapped: the checksum catches a typo the format alone would not.
    it.each(["DE89370400440532013001", "DE88370400440532013000", "DE89370400440532013100", "DE89370400440532031000"])(
      "refuses %s, whose checksum is wrong",
      (iban) => {
        expect(fieldsRejected({ ...valid, iban })).toEqual(["iban"])
      },
    )

    // Launch plan Q54, provisional: German accounts only. Both are valid IBANs: GB82 WEST 1234 5698 7654 32 and AT61 1904 3002 3457 3201.
    it.each(["GB82WEST12345698765432", "AT611904300234573201"])("refuses %s, an IBAN of another country, even a valid one", (iban) => {
      expect(fieldsRejected({ ...valid, iban })).toEqual(["iban"])
    })

    it.each(["", "DE", "DE8937040044053201300", "DE893704004405320130000", "DE89-3704-0044-0532-0130-00", "DE8937040044O532013000"])(
      "refuses %p, which is not 22 letters and digits",
      (iban) => {
        expect(fieldsRejected({ ...valid, iban })).toEqual(["iban"])
      },
    )
  })

  describe("the BIC", () => {
    it.each(["COBADEFFXXX", "COBADEFF", "cobadeff", " COBADEFF "])("accepts %p, in eight or eleven characters", (bic) => {
      expect(parseBankAccount({ ...valid, bic }).bic).toBe(bic.trim().toUpperCase())
    })

    it.each(["", "COBADEF", "COBADEFFX", "COBADEFFXX", "COBADEFFXXXX", "1OBADEFF", "COBA1EFF", "COBADEF-", "cobadeﬀ", "COBAßEFF", "COBADEFſ"])("refuses %p", (bic) => {
      expect(fieldsRejected({ ...valid, bic })).toEqual(["bic"])
    })
  })

  it("needs the name of the bank", () => {
    expect(fieldsRejected({ ...valid, bankName: "  " })).toEqual(["bankName"])
  })

  it("names every wrong part at once", () => {
    expect(fieldsRejected({ iban: "x", bic: "x", bankName: "" })).toEqual(["iban", "bic", "bankName"])
  })

  it("never carries a rejected IBAN in its error", () => {
    let error: unknown
    try {
      parseBankAccount({ ...valid, iban: "DE89370400440532013001" })
    } catch (caught) {
      error = caught
    }

    expect(inspect(error)).not.toContain("DE89370400440532013001")
  })
})
