import { postalAddressSchema } from "@/src/core/domain/customer/postal-address"
import { combinedIkfzStatus, type IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { validate } from "@/src/core/domain/validate"
import type { RegistrationGateway } from "@/src/core/ports/registration/registration-gateway"

const POSTCODE_FIELD = "owner.address.postcode"

export async function checkRegistrationEligibility(
  deps: { registration: Pick<RegistrationGateway, "findAuthorities"> },
  postcode: unknown,
): Promise<{ postcode: string; ikfzStatus: IkfzStatus }> {
  const valid = validate(postalAddressSchema.shape.postcode, postcode, POSTCODE_FIELD)
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities({ postcode: valid }), POSTCODE_FIELD)
  return { postcode: valid, ikfzStatus }
}
