import type { OrderableService, ServiceRequest } from "@/src/core/domain/application/service"
import type { DocumentKind, DocumentRef } from "@/src/core/domain/registration/document"
import type { RegistrationAuthority } from "@/src/core/domain/registration/registration-authority"
import type { Corrections, GatewayStatus, RegistrationGateway } from "@/src/core/ports/registration/registration-gateway"
import { readJson, zulexRequest, type ZulexConfig } from "./http"
import { createBody, PATCH_BODIES } from "./request-bodies"
import { applicationResponse, createApplicationResponse, registrationAuthoritiesResponse, type ApplicationResponse } from "./schemas"

/**
 * The document types each service yields, in domain terms. The other types in the spec's enum
 * (another service's confirmation, UNKNOWN...) and any added later are absent on purpose: the
 * lookup falls through to `unknown`.
 */
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

/** Where each service's applications live in the API: the create, read and patch calls share the path. */
const APPLICATION_PATHS: Record<OrderableService, string> = {
  deregistration: "/deregistration-applications",
  newRegistration: "/registration-applications",
}

/**
 * `RegistrationGateway` on the Zulex API (docs/api-1.yaml). Every call is
 * server-side: the API key is a merchant credential.
 *
 * Wired when `REGISTRATION_DRIVER=zulex`: the integration host in dev and staging, the production
 * host in production. Every call goes through `zulexRequest`, which turns a 400 into
 * `GatewayRejected` and a network failure, timeout, 409, 429 or 5xx into `GatewayUnavailable`;
 * any other status is a plain `ZulexRequestFailed`. Responses are parsed with the schemas in
 * `schemas.ts` and mapped to port types here, so no Zulex shape leaves this class.
 *
 * What the customer entered that is secret (security codes, eVB number, Teil II code, the owner's
 * details, the bank account) is unwrapped with `reveal()` only to build a request body
 * (`request-bodies.ts`), and is never logged. A response echoes it back in plain text, so a body is
 * read only through the schemas, which declare four fields, and is never put in an error.
 * Ids are placed in paths with `encodeURIComponent`, so a malformed stored id cannot change the route.
 */
export class ZulexRegistrationGateway implements RegistrationGateway {
  constructor(private readonly config: ZulexConfig) {}

  /**
   * Looks up by plate prefix or by postcode (the endpoint also takes a kreiscode). Returns every
   * authority it has, unfiltered: what `ikfzStatus` means for the order is the caller's call.
   */
  async findAuthorities(where: { prefix: string } | { postcode: string }): Promise<RegistrationAuthority[]> {
    const query = new URLSearchParams("prefix" in where ? { licencePlatePrefix: where.prefix } : { postcode: where.postcode })
    const response = await zulexRequest(this.config, "GET", `/registration-authorities?${query}`)
    return (await readJson(response, registrationAuthoritiesResponse)).registrationAuthorities
  }

  /**
   * POST to the request's service (/deregistration-applications or /registration-applications). The
   * idempotency key becomes `X-Idempotency-Key`, which the spec limits to 100 characters; that a
   * replayed key returns the same application is Zulex's promise (launch plan Q23 asks whether the
   * live API keeps it).
   */
  async submit(request: ServiceRequest, idempotencyKey: string) {
    const response = await zulexRequest(this.config, "POST", APPLICATION_PATHS[request.service], { body: createBody(request), idempotencyKey })
    return readJson(response, createApplicationResponse)
  }

  /** One GET per call; an id Zulex does not know answers 404, surfacing as `ZulexRequestFailed`. */
  async getStatus(service: OrderableService, applicationId: string): Promise<GatewayStatus> {
    const response = await zulexRequest(this.config, "GET", `${APPLICATION_PATHS[service]}/${encodeURIComponent(applicationId)}`)
    return toGatewayStatus(service, await readJson(response, applicationResponse))
  }

  /**
   * POST /applications/{id}/retry. The path is the generic one, not under a service's own. The spec
   * has it resume processing from the failed step for an application in ERROR from a technical
   * issue, changing no data, and answer 204 with no body. No idempotency key is sent.
   */
  async retry(applicationId: string): Promise<void> {
    await zulexRequest(this.config, "POST", `/applications/${encodeURIComponent(applicationId)}/retry`)
  }

  /**
   * PATCH on the service's path, which the spec describes as patching a rejected application and
   * resubmitting it to the KBA. Only the fields the customer changed are sent, so everything else
   * stays as Zulex holds it. A patch that changes nothing is refused as a plain `Error`, since it
   * would still send the application to the KBA again. The 200 body (the updated application) is
   * ignored: the new status is read by polling like any other.
   */
  async correct<Service extends OrderableService>(service: Service, applicationId: string, correction: Corrections[Service]): Promise<void> {
    const body = PATCH_BODIES[service](correction)
    if (Object.keys(body).length === 0) throw new Error("ZulexRegistrationGateway: nothing to correct")
    await zulexRequest(this.config, "PATCH", `${APPLICATION_PATHS[service]}/${encodeURIComponent(applicationId)}`, { body })
  }

  /**
   * GET /documents/{id}, a binary body handed back untouched. The spec lists only a 200 for it, so a
   * bad id surfaces as `ZulexRequestFailed`.
   */
  async fetchDocument(documentId: string): Promise<Uint8Array> {
    const response = await zulexRequest(this.config, "GET", `/documents/${encodeURIComponent(documentId)}`)
    return new Uint8Array(await response.arrayBuffer())
  }
}

/**
 * Zulex's three statuses to the port's. FINISHED can still carry a rejection document instead of a
 * confirmation (the spec gives no error code for that); the caller tells them apart by document
 * `kind`. Any other tag is in progress.
 * An ERROR without `errorInfo` (the spec makes it optional) reports code 0, which the error
 * algorithm handles like any code it does not know, so the status read still succeeds.
 * Documents are read whatever the status, as the port's `failed` state carries them too.
 */
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
