import { postalAddressSchema } from "@/src/core/domain/customer/postal-address"
import { combinedIkfzStatus, type IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { validate } from "@/src/core/domain/validate"
import type { RegistrationGateway } from "@/src/core/ports/registration/registration-gateway"

const POSTCODE_FIELD = "owner.address.postcode"

/**
 * The first step of the Neuzulassung funnel: which authority handles the keeper's postcode, and
 * whether it processes online (minutes to hours) or by hand (days). A car is registered where its
 * keeper lives, so the lookup is by postcode, not by a plate prefix, which a new car has not got.
 *
 * Reads and stores nothing. The postcode comes straight from the browser: a malformed one, and
 * one no authority answers to, are a `ValidationError`. A postcode that spans several authorities
 * gets the slowest status. A registration service outage (`GatewayUnavailable`) is left to the
 * caller. `submitCheckout` asks again and stores the answer on the order.
 */
export async function checkRegistrationEligibility(
  deps: { registration: Pick<RegistrationGateway, "findAuthorities"> },
  postcode: unknown,
): Promise<{ postcode: string; ikfzStatus: IkfzStatus }> {
  const valid = validate(postalAddressSchema.shape.postcode, postcode, POSTCODE_FIELD)
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities({ postcode: valid }), POSTCODE_FIELD)
  return { postcode: valid, ikfzStatus }
}
