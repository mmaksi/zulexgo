import { customerSteps, type CustomerStep } from "@/src/core/domain/customer-steps"
import type { Application } from "@/src/core/domain/application"
import type { LicencePlate } from "@/src/core/domain/licence-plate"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"

const VIN_VISIBLE = 4

/**
 * Everything the status page may show, and nothing more: the plate and the end
 * of the VIN identify the vehicle; the security codes never leave the server.
 */
export interface StatusView {
  readonly reference: Application["reference"]
  readonly status: Application["status"]
  readonly licencePlate: LicencePlate
  readonly vinEnding: string
  readonly steps: CustomerStep[]
}

export async function getStatusByToken(deps: { repository: Pick<ApplicationRepository, "findByStatusToken"> }, token: string): Promise<StatusView> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()

  const { reference, status, request } = application
  return {
    reference,
    status,
    licencePlate: request.licencePlate,
    vinEnding: request.vin.slice(-VIN_VISIBLE),
    steps: customerSteps(application),
  }
}
