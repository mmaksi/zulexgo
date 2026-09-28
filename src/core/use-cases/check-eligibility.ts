import { licencePlateSchema } from "@/src/core/domain/licence-plate"
import { combinedIkfzStatus, type IkfzStatus } from "@/src/core/domain/registration-authority"
import { validate } from "@/src/core/domain/validate"
import type { RegistrationGateway } from "@/src/core/ports/registration-gateway"

/**
 * Before any effort or money: which authority handles the plate prefix, and
 * whether it processes online (minutes to hours) or manually (days).
 */
export async function checkEligibility(
  deps: { registration: Pick<RegistrationGateway, "findAuthorities"> },
  prefix: unknown,
): Promise<{ prefix: string; ikfzStatus: IkfzStatus }> {
  const valid = validate(licencePlateSchema.shape.prefix, prefix, "licencePlate.prefix")
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities(valid))
  return { prefix: valid, ikfzStatus }
}
