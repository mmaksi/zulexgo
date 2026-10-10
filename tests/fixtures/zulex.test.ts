import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW } from "@/tests/fixtures/new-registration"
import { createRegistrationApplicationSpec, patchRegistrationApplicationSpec } from "@/tests/fixtures/zulex"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import { createBody } from "@/src/adapters/registration/zulex/request-bodies"

const valid = createBody(parseNewRegistrationRequest(FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW))

function withChange(path: string, value: unknown): unknown {
  const body = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>
  const keys = path.split(".")
  const last = keys.pop()!
  const parent = keys.reduce((node, key) => node[key] as Record<string, unknown>, body)
  if (value === undefined) delete parent[last]
  else parent[last] = value
  return body
}

const PLATE = "admissionInfo.licencePlateInfo.licencePlateAttributes"

describe("the spec's model of a registration's create body", () => {
  it("accepts a private person's standard registration", () => {
    expect(createRegistrationApplicationSpec.safeParse(valid).success).toBe(true)
  })

  it("accepts a seasonal plate with its months", () => {
    const seasonal = withChange(`${PLATE}.seasonalLicencePlateFrom`, 4)

    expect(createRegistrationApplicationSpec.safeParse(seasonal).success).toBe(true)
  })

  it.each([
    ["a field the spec does not name", "vehicleInfo.registered", true],
    ["a misspelt field", "ownerInfo.personalInfo.address.postcode", "10115"],
    ["a missing required field", "evbNumber", undefined],
    ["a missing required part of the address", "ownerInfo.personalInfo.address.zipCode", undefined],
    ["a missing delivery", "ownerInfo.deliveryInfo", undefined],
    ["a delivery to nobody", "ownerInfo.deliveryInfo.deliveryAddress.firstName", undefined],
    ["an owner source the spec has for others", "ownerInfo.source", "REQUEST_FOR_LEGAL_ENTITY"],
    ["a gender the enum does not have", "ownerInfo.personalInfo.gender", "OTHER"],
    ["an engine the enum does not have", "vehicleInfo.engineType", "ELECTRIC"],
    ["a month after December", `${PLATE}.seasonalLicencePlateFrom`, 13],
    ["a month before January", `${PLATE}.seasonalLicencePlateUntil`, 0],
    ["an eVB number of six characters", "evbNumber", "FAKEEV"],
    ["a lower-case VIN", "vehicleInfo.vin", "fakevin0000000002"],
    ["a house number that is not a number", "ownerInfo.personalInfo.address.houseNumber", "abc"],
    ["a birth date not written as a date", "ownerInfo.personalInfo.birthDate", "17.05.1990"],
    ["a Teil II number of 21 characters", "registrationCertificateInfo.registrationCertificatePart2Number", "X".repeat(21)],
    ["a BIC of 12 characters", "ownerInfo.sepaInfo.bic", "COBADEFFXXXX"],
  ])("refuses %s", (_, path, value) => {
    expect(createRegistrationApplicationSpec.safeParse(withChange(path, value)).success).toBe(false)
  })
})

describe("the spec's model of a registration's patch body", () => {
  it.each([
    [{ evbNumber: "NEWEVB1" }],
    [{ registrationCertificatePart2Number: "NEW0002", registrationCertificatePart2SecurityCode: "NEWCODE" }],
  ])("accepts %j", (body) => {
    expect(patchRegistrationApplicationSpec.safeParse(body).success).toBe(true)
  })

  it.each([
    ["a field that cannot be patched", { vin: "FAKEVIN0000000002" }],
    ["the owner, which cannot be patched", { ownerInfo: {} }],
    ["an eVB number of the wrong shape", { evbNumber: "NEWEVB" }],
    ["a Teil II number of 21 characters", { registrationCertificatePart2Number: "X".repeat(21) }],
  ])("refuses %s", (_, body) => {
    expect(patchRegistrationApplicationSpec.safeParse(body).success).toBe(false)
  })
})
