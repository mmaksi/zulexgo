import { ValidationError } from "@/src/core/errors/validation-error"
import { validate } from "@/src/core/domain/validate"
import { plateOptionsSchema } from "./plate-options"

const parsePlateOptions = (input: unknown) => validate(plateOptionsSchema, input, "plate")

const fieldsRejected = (input: unknown) => {
  try {
    parsePlateOptions(input)
  } catch (error) {
    if (error instanceof ValidationError) return error.fields
    throw error
  }
  throw new Error("expected a ValidationError")
}

describe("parsePlateOptions: what the customer may ask of the plate the authority assigns", () => {
  it("is an ordinary plate when nothing is chosen", () => {
    expect(parsePlateOptions({})).toEqual({ electric: false })
  })

  it("takes an E-plate", () => {
    expect(parsePlateOptions({ electric: true })).toEqual({ electric: true })
  })

  it("takes a seasonal plate with its first and last month", () => {
    expect(parsePlateOptions({ seasonal: { from: 4, until: 10 } })).toEqual({ electric: false, seasonal: { from: 4, until: 10 } })
  })

  it("takes both together", () => {
    expect(parsePlateOptions({ electric: true, seasonal: { from: 3, until: 11 } })).toEqual({
      electric: true,
      seasonal: { from: 3, until: 11 },
    })
  })

  describe("the months run from 1 to 12, as the API says", () => {
    it.each([[1, 12], [12, 1]])("accepts from %i until %i", (from, until) => {
      expect(parsePlateOptions({ seasonal: { from, until } }).seasonal).toEqual({ from, until })
    })

    it.each([0, 13, -1, 4.5, "4", null])("refuses %p as the first month", (from) => {
      expect(fieldsRejected({ seasonal: { from, until: 10 } })).toEqual(["seasonal.from"])
    })

    it.each([0, 13, 10.5, "10"])("refuses %p as the last month", (until) => {
      expect(fieldsRejected({ seasonal: { from: 4, until } })).toEqual(["seasonal.until"])
    })

    it("refuses a season with only one end", () => {
      expect(fieldsRejected({ seasonal: { from: 4 } })).toEqual(["seasonal.until"])
      expect(fieldsRejected({ seasonal: { until: 10 } })).toEqual(["seasonal.from"])
    })
  })

  it("refuses an electric flag that is not true or false", () => {
    expect(fieldsRejected({ electric: "yes" })).toEqual(["electric"])
  })
})
