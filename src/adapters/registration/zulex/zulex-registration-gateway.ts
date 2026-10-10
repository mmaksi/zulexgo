import type { OrderableService, ServiceRequest } from "@/src/core/domain/application/service"
import type { DocumentKind, DocumentRef } from "@/src/core/domain/registration/document"
import type { RegistrationAuthority } from "@/src/core/domain/registration/registration-authority"
import type { Corrections, GatewayStatus, RegistrationGateway } from "@/src/core/ports/registration/registration-gateway"
import { readJson, zulexRequest, type ZulexConfig } from "./http"
import { createBody, PATCH_BODIES } from "./request-bodies"
import { applicationResponse, createApplicationResponse, registrationAuthoritiesResponse, type ApplicationResponse } from "./schemas"

const DOCUMENT_KINDS: Record<OrderableService, ReadonlyMap<string, DocumentKind>> = {
  deregistration: new Map<string, DocumentKind>([
    ["DEREGISTRATION_CONFIRMATION", "confirmation"],
    ["REJECTION", "rejection"],
    ["FEE", "fee"],
  ]),
  newRegistration: new Map<string, DocumentKind>([
    ["REGISTRATION_CONFIRMATION", "confirmation"],
    ["TEMPORARY_REGISTRATION_CERTIFICATE", "temporaryCertificate"],
    ["REJECTION", "rejection"],
    ["FEE", "fee"],
  ]),
}

const APPLICATION_PATHS: Record<OrderableService, string> = {
  deregistration: "/deregistration-applications",
  newRegistration: "/registration-applications",
}

export class ZulexRegistrationGateway implements RegistrationGateway {
  constructor(private readonly config: ZulexConfig) {}

  async findAuthorities(where: { prefix: string } | { postcode: string }): Promise<RegistrationAuthority[]> {
    const query = new URLSearchParams("prefix" in where ? { licencePlatePrefix: where.prefix } : { postcode: where.postcode })
    const response = await zulexRequest(this.config, "GET", `/registration-authorities?${query}`)
    return (await readJson(response, registrationAuthoritiesResponse)).registrationAuthorities
  }

  // X-Idempotency-Key is capped at 100 characters; same-key replay is unverified live (launch plan Q23).
  async submit(request: ServiceRequest, idempotencyKey: string) {
    const response = await zulexRequest(this.config, "POST", APPLICATION_PATHS[request.service], { body: createBody(request), idempotencyKey })
    return readJson(response, createApplicationResponse)
  }

  async getStatus(service: OrderableService, applicationId: string): Promise<GatewayStatus> {
    const response = await zulexRequest(this.config, "GET", `${APPLICATION_PATHS[service]}/${encodeURIComponent(applicationId)}`)
    return toGatewayStatus(service, await readJson(response, applicationResponse))
  }

  async retry(applicationId: string): Promise<void> {
    await zulexRequest(this.config, "POST", `/applications/${encodeURIComponent(applicationId)}/retry`)
  }

  // Zulex resubmits to the KBA on any PATCH, so an empty patch is refused rather than sent.
  async correct<Service extends OrderableService>(service: Service, applicationId: string, correction: Corrections[Service]): Promise<void> {
    const body = PATCH_BODIES[service](correction)
    if (Object.keys(body).length === 0) throw new Error("ZulexRegistrationGateway: nothing to correct")
    await zulexRequest(this.config, "PATCH", `${APPLICATION_PATHS[service]}/${encodeURIComponent(applicationId)}`, { body })
  }

  async fetchDocument(documentId: string): Promise<Uint8Array> {
    const response = await zulexRequest(this.config, "GET", `/documents/${encodeURIComponent(documentId)}`)
    return new Uint8Array(await response.arrayBuffer())
  }
}

// FINISHED may carry a rejection document instead of a confirmation; callers tell them apart by kind.
function toGatewayStatus(service: OrderableService, { status, documents, errorInfo }: ApplicationResponse): GatewayStatus {
  const kinds = DOCUMENT_KINDS[service]
  const refs: DocumentRef[] = documents.map(({ id, type }) => ({ id, kind: kinds.get(type) ?? "unknown" }))

  if (status === "FINISHED") return { state: "finished", documents: refs }
  if (status === "ERROR") {
    const { code = 0, description, details = [] } = errorInfo ?? {}
    return { state: "failed", error: { code, ...(description ? { description } : {}), details }, documents: refs }
  }
  return { state: "inProgress" }
}
