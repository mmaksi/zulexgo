import type { RegistrationAuthority } from "@/src/core/domain/registration-authority"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkEligibility } from "./check-eligibility"

const answering = (authorities: RegistrationAuthority[]) => ({ findAuthorities: jest.fn(async () => authorities) })

describe("checkEligibility", () => {
  it("expects the slowest authority behind a prefix", async () => {
    const registration = answering([
      { kreiscode: "00001", ikfzStatus: "online" },
      { kreiscode: "00002", ikfzStatus: "unavailable" },
    ])

    expect(await checkEligibility({ registration }, " aaa ")).toEqual({ prefix: "AAA", ikfzStatus: "unavailable" })
    expect(registration.findAuthorities).toHaveBeenCalledWith("AAA")
  })

  it("rejects a prefix the API would refuse without asking it", async () => {
    const registration = answering([{ kreiscode: "00001", ikfzStatus: "online" }])

    await expect(checkEligibility({ registration }, "AB1")).rejects.toEqual(new ValidationError(["licencePlate.prefix"]))
    expect(registration.findAuthorities).not.toHaveBeenCalled()
  })

  it("rejects a prefix no authority answers for", async () => {
    await expect(checkEligibility({ registration: answering([]) }, "ZZZ")).rejects.toEqual(
      new ValidationError(["licencePlate.prefix"]),
    )
  })
})
