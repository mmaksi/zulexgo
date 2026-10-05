import type { RegistrationAuthority } from "@/src/core/domain/registration/registration-authority"
import { ValidationError } from "@/src/core/errors/validation-error"
import { checkRegistrationEligibility } from "./check-registration-eligibility"

const answering = (authorities: RegistrationAuthority[]) => ({ findAuthorities: jest.fn(async () => authorities) })

describe("checkRegistrationEligibility", () => {
  it("asks for the authority by postcode, where the keeper lives, and expects the slowest one", async () => {
    const registration = answering([
      { kreiscode: "00001", ikfzStatus: "online" },
      { kreiscode: "00002", ikfzStatus: "offline" },
    ])

    expect(await checkRegistrationEligibility({ registration }, " 10115 ")).toEqual({ postcode: "10115", ikfzStatus: "offline" })
    expect(registration.findAuthorities).toHaveBeenCalledWith({ postcode: "10115" })
  })

  it.each(["1011", "101150", "1O115", "", undefined, 10115])("rejects the postcode %j without asking the API", async (postcode) => {
    const registration = answering([{ kreiscode: "00001", ikfzStatus: "online" }])

    await expect(checkRegistrationEligibility({ registration }, postcode)).rejects.toEqual(new ValidationError(["owner.address.postcode"]))
    expect(registration.findAuthorities).not.toHaveBeenCalled()
  })

  it("rejects a postcode no authority answers for, naming the postcode and not a plate prefix", async () => {
    await expect(checkRegistrationEligibility({ registration: answering([]) }, "99999")).rejects.toEqual(new ValidationError(["owner.address.postcode"]))
  })
})
