import { licencePlateSchema } from "@/src/core/domain/vehicle/licence-plate"
import { combinedIkfzStatus, type IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { validate } from "@/src/core/domain/validate"
import type { RegistrationGateway } from "@/src/core/ports/registration/registration-gateway"

export async function checkEligibility(
  deps: { registration: Pick<RegistrationGateway, "findAuthorities"> },
  prefix: unknown,
): Promise<{ prefix: string; ikfzStatus: IkfzStatus }> {
  const valid = validate(licencePlateSchema.shape.prefix, prefix, "licencePlate.prefix")
  const ikfzStatus = combinedIkfzStatus(await deps.registration.findAuthorities({ prefix: valid }))
  return { prefix: valid, ikfzStatus }
}
