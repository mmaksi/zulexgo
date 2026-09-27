import { ValidationError } from "@/src/core/errors/validation-error"
import { combinedIkfzStatus } from "./registration-authority"

const authority = (ikfzStatus: "online" | "unavailable" | "offline") => ({ kreiscode: "00000", ikfzStatus })

describe("combinedIkfzStatus", () => {
  it("is online only when every authority behind the prefix is", () => {
    expect(combinedIkfzStatus([authority("online"), authority("online")])).toBe("online")
  })

  it("expects the slowest when a prefix spans several authorities, since we cannot tell which one decides", () => {
    expect(combinedIkfzStatus([authority("online"), authority("unavailable")])).toBe("unavailable")
    expect(combinedIkfzStatus([authority("unavailable"), authority("offline"), authority("online")])).toBe("offline")
  })

  it("rejects a prefix no authority answers for", () => {
    expect(() => combinedIkfzStatus([])).toThrow(expect.objectContaining({ fields: ["licencePlate.prefix"] }))
    expect(() => combinedIkfzStatus([])).toThrow(ValidationError)
  })
})
