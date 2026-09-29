import { customerSteps, type CustomerStep } from "@/src/core/domain/customer-steps"
import type { Application } from "@/src/core/domain/application"
import { DOCUMENT_KINDS, type DocumentRef } from "@/src/core/domain/document"
import type { LicencePlate } from "@/src/core/domain/licence-plate"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import type { DocumentStore } from "@/src/core/ports/document-store"

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
  /** What the customer may download: the ids to ask the download route for, confirmation first. */
  readonly documents: readonly DocumentRef[]
}

export async function getStatusByToken(
  deps: { repository: Pick<ApplicationRepository, "findByStatusToken">; documents: Pick<DocumentStore, "list"> },
  token: string,
): Promise<StatusView> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()

  const { reference, status, request } = application
  const documents = await deps.documents.list(reference)
  return {
    reference,
    status,
    licencePlate: request.licencePlate,
    vinEnding: request.vin.slice(-VIN_VISIBLE),
    steps: customerSteps(application),
    documents: [...documents].sort(
      (a, b) => DOCUMENT_KINDS.indexOf(a.kind) - DOCUMENT_KINDS.indexOf(b.kind) || a.id.localeCompare(b.id),
    ),
  }
}
