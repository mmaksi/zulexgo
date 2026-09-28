import type { DeregistrationRequest } from "@/src/core/domain/deregistration-request"
import type { DocumentKind, DocumentRef } from "@/src/core/domain/document"
import type { RegistrationAuthority } from "@/src/core/domain/registration-authority"
import type { Correction, GatewayStatus, RegistrationGateway } from "@/src/core/ports/registration-gateway"
import { readJson, zulexRequest, type ZulexConfig } from "./http"
import {
  createApplicationResponse,
  deregistrationApplicationResponse,
  registrationAuthoritiesResponse,
  type DeregistrationApplicationResponse,
} from "./schemas"

const DOCUMENT_KINDS = new Map<string, DocumentKind>([
  ["DEREGISTRATION_CONFIRMATION", "confirmation"],
  ["REJECTION", "rejection"],
  ["FEE", "fee"],
])

/**
 * `RegistrationGateway` on the Zulex API (docs/api-1.yaml). Every call is
 * server-side: the API key is a merchant credential.
 */
export class ZulexRegistrationGateway implements RegistrationGateway {
  constructor(private readonly config: ZulexConfig) {}

  async findAuthorities(licencePlatePrefix: string): Promise<RegistrationAuthority[]> {
    const query = new URLSearchParams({ licencePlatePrefix })
    const response = await zulexRequest(this.config, "GET", `/registration-authorities?${query}`)
    return (await readJson(response, registrationAuthoritiesResponse)).registrationAuthorities
  }

  async submitDeregistration(request: DeregistrationRequest, idempotencyKey: string) {
    const { licencePlate, vin, codes } = request
    const body = {
      licencePlate,
      vin,
      rearLicencePlateSecurityCode: codes.rearPlate.reveal(),
      ...(codes.frontPlate ? { frontLicencePlateSecurityCode: codes.frontPlate.reveal() } : {}),
      securityCodeRegistrationCertificationPart1: codes.certificate.reveal(),
      // Reserving the plate is out of scope for the MVP (founder decision).
      reserveLicencePlate: false,
    }
    const response = await zulexRequest(this.config, "POST", "/deregistration-applications", { body, idempotencyKey })
    return readJson(response, createApplicationResponse)
  }

  async getStatus(applicationId: string): Promise<GatewayStatus> {
    const response = await zulexRequest(this.config, "GET", `/deregistration-applications/${encodeURIComponent(applicationId)}`)
    return toGatewayStatus(await readJson(response, deregistrationApplicationResponse))
  }

  async retry(applicationId: string): Promise<void> {
    await zulexRequest(this.config, "POST", `/applications/${encodeURIComponent(applicationId)}/retry`)
  }

  async correct(applicationId: string, { licencePlate, vin, codes }: Correction): Promise<void> {
    const body = {
      ...(licencePlate ? { licencePlate } : {}),
      ...(vin ? { vin } : {}),
      ...(codes?.rearPlate ? { rearLicencePlateSecurityCode: codes.rearPlate.reveal() } : {}),
      ...(codes?.frontPlate ? { frontLicencePlateSecurityCode: codes.frontPlate.reveal() } : {}),
      ...(codes?.certificate ? { securityCodeRegistrationCertificationPart1: codes.certificate.reveal() } : {}),
    }
    await zulexRequest(this.config, "PATCH", `/deregistration-applications/${encodeURIComponent(applicationId)}`, { body })
  }

  async fetchDocument(documentId: string): Promise<Uint8Array> {
    const response = await zulexRequest(this.config, "GET", `/documents/${encodeURIComponent(documentId)}`)
    return new Uint8Array(await response.arrayBuffer())
  }
}

function toGatewayStatus({ status, documents, errorInfo }: DeregistrationApplicationResponse): GatewayStatus {
  const refs: DocumentRef[] = documents.map(({ id, type }) => ({ id, kind: DOCUMENT_KINDS.get(type) ?? "unknown" }))

  if (status === "FINISHED") return { state: "finished", documents: refs }
  if (status === "ERROR") {
    const { code = 0, description, details = [] } = errorInfo ?? {}
    return { state: "failed", error: { code, ...(description ? { description } : {}), details }, documents: refs }
  }
  return { state: "inProgress" }
}
