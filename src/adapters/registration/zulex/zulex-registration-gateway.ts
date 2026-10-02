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

/**
 * The document types a de-registration yields, in domain terms. The other types in the spec's enum
 * (registration confirmation, UNKNOWN...) and any added later are absent on purpose: the lookup
 * falls through to `unknown`.
 */
const DOCUMENT_KINDS = new Map<string, DocumentKind>([
  ["DEREGISTRATION_CONFIRMATION", "confirmation"],
  ["REJECTION", "rejection"],
  ["FEE", "fee"],
])

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
 * Security codes are unwrapped with `reveal()` only to build a request body, and are never logged.
 * Ids are placed in paths with `encodeURIComponent`, so a malformed stored id cannot change the route.
 */
export class ZulexRegistrationGateway implements RegistrationGateway {
  constructor(private readonly config: ZulexConfig) {}

  /**
   * Looks up by plate prefix only (the endpoint also takes a postcode or kreiscode). Returns every
   * authority the prefix has, unfiltered: what `ikfzStatus` means for the order is the caller's call.
   */
  async findAuthorities(licencePlatePrefix: string): Promise<RegistrationAuthority[]> {
    const query = new URLSearchParams({ licencePlatePrefix })
    const response = await zulexRequest(this.config, "GET", `/registration-authorities?${query}`)
    return (await readJson(response, registrationAuthoritiesResponse)).registrationAuthorities
  }

  /**
   * POST /deregistration-applications. The idempotency key becomes `X-Idempotency-Key`, which the spec
   * limits to 100 characters; that a replayed key returns the same application is Zulex's promise
   * (launch plan Q23 asks whether the live API keeps it). The front plate code is sent only for a
   * two-plate vehicle.
   */
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

  /** One GET per call; an id Zulex does not know answers 404, surfacing as `ZulexRequestFailed`. */
  async getStatus(applicationId: string): Promise<GatewayStatus> {
    const response = await zulexRequest(this.config, "GET", `/deregistration-applications/${encodeURIComponent(applicationId)}`)
    return toGatewayStatus(await readJson(response, deregistrationApplicationResponse))
  }

  /**
   * POST /applications/{id}/retry. The path is the generic one, not under /deregistration-applications.
   * The spec has it resume processing from the failed step for an application in ERROR from a
   * technical issue, changing no data, and answer 204 with no body. No idempotency key is sent.
   */
  async retry(applicationId: string): Promise<void> {
    await zulexRequest(this.config, "POST", `/applications/${encodeURIComponent(applicationId)}/retry`)
  }

  /**
   * PATCH /deregistration-applications/{id}, which the spec describes as patching a rejected
   * application and resubmitting it to the KBA. Only the fields the customer changed are sent, so
   * everything else stays as Zulex holds it. The 200 body (the updated application) is ignored: the
   * new status is read by polling like any other.
   */
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
function toGatewayStatus({ status, documents, errorInfo }: DeregistrationApplicationResponse): GatewayStatus {
  const refs: DocumentRef[] = documents.map(({ id, type }) => ({ id, kind: DOCUMENT_KINDS.get(type) ?? "unknown" }))

  if (status === "FINISHED") return { state: "finished", documents: refs }
  if (status === "ERROR") {
    const { code = 0, description, details = [] } = errorInfo ?? {}
    return { state: "failed", error: { code, ...(description ? { description } : {}), details }, documents: refs }
  }
  return { state: "inProgress" }
}
