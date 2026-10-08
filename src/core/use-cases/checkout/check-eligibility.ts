import { licencePlateSchema } from "@/src/core/domain/vehicle/licence-plate"
import { combinedIkfzStatus, type IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { validate } from "@/src/core/domain/validate"
import type { RegistrationGateway } from "@/src/core/ports/registration/registration-gateway"

/**
 * Before any effort or money: which authority handles the plate prefix, and
 * whether it processes online (minutes to hours) or manually (days).
 *
 * The first step of the funnel, asked as soon as the customer enters a prefix; it
 * reads and stores nothing. The prefix comes straight from the browser, so it is
 * validated here: a malformed one, and one no authority answers to, are a
 * `ValidationError`. A prefix that spans several authorities gets the slowest status,
 * so the customer is warned of days rather than promised minutes. A registration
 * service outage (`GatewayUnavailable`) is left to the caller. `submitCheckout` asks
 * again and stores the answer on the order, where it sets when the card is captured
 * and how often the KBA is asked.
 */
export async function checkEligibility(
  deps: { registration: Pick<RegistrationGateway, "findAuthorities"> },
  prefix: unknown,
): Promise<{ prefix: string; ikfzStatus: IkfzStatus }> {
  const valid = validate(licencePlateSchema.shape.prefix, prefix, "licencePlate.prefix")
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities({ prefix: valid }))
  return { prefix: valid, ikfzStatus }
}
