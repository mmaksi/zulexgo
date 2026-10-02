import type { DeregistrationRequest } from "@/src/core/domain/deregistration-request"
import type { DocumentRef } from "@/src/core/domain/document"
import type { LicencePlate } from "@/src/core/domain/licence-plate"
import type { RegistrationAuthority } from "@/src/core/domain/registration-authority"
import type { SecurityCode } from "@/src/core/domain/security-code"
import type { Vin } from "@/src/core/domain/vin"

/** The KBA's error as reported, uninterpreted. Whether it is correctable is the error algorithm's call. */
export interface ProcessingError {
  /** The Zulex adapter reports 0 when the service sends no code. */
  readonly code: number
  /** Vendor text: never shown to a customer, and never stored (only the code is). */
  readonly description?: string
  readonly details: readonly string[]
}

/**
 * The vendor has three states and no timestamps. Any state tag it adds later
 * arrives here as `inProgress`, so the status page never breaks on one.
 */
export type GatewayStatus =
  | { readonly state: "inProgress" }
  /** Done, not necessarily approved: a rejection document with no confirmation is a failure. */
  | { readonly state: "finished"; readonly documents: readonly DocumentRef[] }
  | { readonly state: "failed"; readonly error: ProcessingError; readonly documents: readonly DocumentRef[] }

/** Only the fields the customer changed; the service resubmits to the KBA. */
export interface Correction {
  readonly licencePlate?: LicencePlate
  readonly vin?: Vin
  /** Security codes, handled as on submission: revealed only to build the request, never logged. */
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
 * - `GatewayRejected` and `GatewayUnavailable` can come from any method. Anything
 *   else that goes wrong (a wrong API key, an unknown id, an answer that cannot
 *   be read) is an ordinary `Error`, neither retried nor classified here.
 * - The requests carry security codes: an adapter reveals them only to build
 *   the outgoing request and never logs them or puts them in an error.
 */
export interface RegistrationGateway {
  /**
   * The list is passed up as the service gives it; callers combine it to the
   * slowest status (`combinedIkfzStatus`), which rejects an empty one as an
   * invalid prefix. The fake answers a prefix it was not told about with one
   * online authority.
   */
  findAuthorities(licencePlatePrefix: string): Promise<RegistrationAuthority[]>
  /**
   * `idempotencyKey` is the application's own and goes out as
   * `X-Idempotency-Key`. `applicationId` is the service's id, not our
   * reference. The fake honours a replayed key; whether the real service does
   * is open (launch plan Q23), so the use case stores the id before doing
   * anything else that can fail.
   */
  submitDeregistration(request: DeregistrationRequest, idempotencyKey: string): Promise<{ applicationId: string }>
  /**
   * An id the service does not know is an ordinary `Error` from the Zulex
   * adapter, but `inProgress` from the fake: on staging each Vercel instance
   * has its own, and may be asked about an application another one filed.
   */
  getStatus(applicationId: string): Promise<GatewayStatus>
  /**
   * Resumes a technically failed application without changing data. Used for
   * the one silent retry of a KBA technical error; the caller counts the
   * attempts, not the gateway.
   */
  retry(applicationId: string): Promise<void>
  /**
   * Patches an application the service already holds. `GatewayRejected` means
   * the new data was refused and the order stays as it was. Not safe to repeat
   * blindly: a second patch reaches the KBA again, so callers check `getStatus`
   * first and patch only an application that is not already `inProgress`.
   */
  correct(applicationId: string, correction: Correction): Promise<void>
  /** The raw bytes of one document, by an id a `GatewayStatus` listed. */
  fetchDocument(documentId: string): Promise<Uint8Array>
}
