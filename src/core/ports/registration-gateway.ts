import type { DeregistrationRequest } from "@/src/core/domain/deregistration-request"
import type { DocumentRef } from "@/src/core/domain/document"
import type { LicencePlate } from "@/src/core/domain/licence-plate"
import type { RegistrationAuthority } from "@/src/core/domain/registration-authority"
import type { SecurityCode } from "@/src/core/domain/security-code"
import type { Vin } from "@/src/core/domain/vin"

/** The KBA's error as reported, uninterpreted. Whether it is correctable is the error algorithm's call. */
export interface ProcessingError {
  readonly code: number
  readonly description?: string
  readonly details: readonly string[]
}

/**
 * The vendor has three states and no timestamps. Any state tag it adds later
 * arrives here as `inProgress`, so the status page never breaks on one.
 */
export type GatewayStatus =
  | { readonly state: "inProgress" }
  | { readonly state: "finished"; readonly documents: readonly DocumentRef[] }
  | { readonly state: "failed"; readonly error: ProcessingError; readonly documents: readonly DocumentRef[] }

/** Only the fields the customer changed; the service resubmits to the KBA. */
export interface Correction {
  readonly licencePlate?: LicencePlate
  readonly vin?: Vin
  readonly codes?: { readonly rearPlate?: SecurityCode; readonly frontPlate?: SecurityCode; readonly certificate?: SecurityCode }
}

/**
 * Files de-registrations with the KBA through a registration service (Zulex).
 *
 * Guarantees every adapter must honour:
 * - `submitDeregistration` with an idempotency key already used returns the
 *   same application id and files nothing new, so a network retry never files
 *   twice. Different keys file different applications.
 * - A fresh submission reports `inProgress`.
 * - Refused data throws `GatewayRejected`; a transient failure throws
 *   `GatewayUnavailable`, carrying the vendor's Retry-After when given.
 *   Vendor errors never cross this boundary.
 * - A prefix may belong to several authorities; all are returned.
 */
export interface RegistrationGateway {
  findAuthorities(licencePlatePrefix: string): Promise<RegistrationAuthority[]>
  submitDeregistration(request: DeregistrationRequest, idempotencyKey: string): Promise<{ applicationId: string }>
  getStatus(applicationId: string): Promise<GatewayStatus>
  /** Resumes a technically failed application without changing data. */
  retry(applicationId: string): Promise<void>
  correct(applicationId: string, correction: Correction): Promise<void>
  fetchDocument(documentId: string): Promise<Uint8Array>
}
