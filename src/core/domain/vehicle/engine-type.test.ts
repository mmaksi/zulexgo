import { ValidationError } from "@/src/core/errors/validation-error"
import { parseEngineType } from "./engine-type"

describe("parseEngineType", () => {
  it.each(["electric", "hybrid", "combustion"] as const)("accepts %s", (engineType) => {
    expect(parseEngineType(engineType)).toBe(engineType)
  })

  // The API also has NO_ENGINE, which a car never has.
  it.each(["", "diesel", "NO_ENGINE", "noEngine", "ELECTRICAL", undefined, 3])("refuses %p", (input) => {
    expect(() => parseEngineType(input)).toThrow(new ValidationError(["engineType"]))
  })
})
