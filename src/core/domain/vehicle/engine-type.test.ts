import { ValidationError } from "@/src/core/errors/validation-error"
import { validate } from "@/src/core/domain/validate"
import { engineTypeSchema } from "./engine-type"

const parseEngineType = (input: unknown) => validate(engineTypeSchema, input, "engineType")

describe("parseEngineType", () => {
  it.each(["electric", "hybrid", "combustion"] as const)("accepts %s", (engineType) => {
    expect(parseEngineType(engineType)).toBe(engineType)
  })

  it.each(["", "diesel", "NO_ENGINE", "noEngine", "ELECTRICAL", undefined, 3])("refuses %p", (input) => {
    expect(() => parseEngineType(input)).toThrow(new ValidationError(["engineType"]))
  })
})
