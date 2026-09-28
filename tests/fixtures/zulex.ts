/**
 * Zulex payloads, modelled on docs/api-1.yaml: the integration environment has
 * been down since 2026-09-27, so no response has been captured yet. When it is
 * back, the M4 spike replaces these with scrubbed real responses. Values are
 * obviously fake and pass the spec's patterns.
 */

export const ZULEX_BASE_URL = "https://integration-zulex.de/zulex-api/v1"

export type ZulexStatus = "IN_PROGRESS" | "FINISHED" | "ERROR"

export type ZulexDocumentType =
  | "DEREGISTRATION_CONFIRMATION"
  | "REGISTRATION_CONFIRMATION"
  | "FEE"
  | "TEMPORARY_REGISTRATION_CERTIFICATE"
  | "REJECTION"
  | "UNKNOWN"

export interface ZulexDocument {
  /** int64 in the spec; kept as source text so ids beyond 2^53 survive the fixture. */
  readonly id: string
  readonly type: ZulexDocumentType
}

export interface ZulexErrorInfo {
  readonly code: number
  readonly description?: string
  readonly details?: string[]
}

export interface CreateDeregistrationBody {
  licencePlate: { prefix: string; letters: string; numbers: string }
  vin: string
  rearLicencePlateSecurityCode: string
  frontLicencePlateSecurityCode?: string
  securityCodeRegistrationCertificationPart1: string
  reserveLicencePlate?: boolean
  correlationId?: string
}

/** GetDeregistrationApplicationResponse as JSON text. Document ids are written as bare int64 numbers. */
export function deregistrationResponseJson(input: {
  applicationId: string
  body: CreateDeregistrationBody
  status: ZulexStatus | string
  documents?: readonly ZulexDocument[]
  errorInfo?: ZulexErrorInfo
}): string {
  const documents = (input.documents ?? []).map((document) => `{"id":${document.id},"type":"${document.type}"}`)
  const rest = JSON.stringify({
    applicationId: input.applicationId,
    ...input.body,
    reserveLicencePlate: input.body.reserveLicencePlate ?? false,
    status: input.status,
    ...(input.errorInfo ? { errorInfo: input.errorInfo } : {}),
  })
  return `{"documents":[${documents.join(",")}],${rest.slice(1)}`
}
