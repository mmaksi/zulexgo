import { createHash } from "node:crypto"
import type { DeregistrationRequest } from "@/src/core/domain/deregistration-request"
import type { RegistrationAuthority } from "@/src/core/domain/registration-authority"
import type { Correction, GatewayStatus, RegistrationGateway } from "@/src/core/ports/registration-gateway"

/** The calls `failNext` can break. Authority and document lookups cannot be scripted to fail. */
type Operation = "submit" | "getStatus" | "retry" | "correct"

/** What any plate prefix resolves to unless scripted: one authority that processes automatically. */
const ONLINE: RegistrationAuthority[] = [{ kreiscode: "00000", ikfzStatus: "online" }]
/** Where every application starts and returns to after a retry or correction. */
const IN_PROGRESS: GatewayStatus = { state: "inProgress" }

/**
 * Scriptable stand-in for Zulex: set a status, fail the next call, inspect what was sent.
 * Staging runs one per Vercel instance, so ids come from the idempotency key and an
 * application this instance never filed reports in progress, as it does on the one that did.
 *
 * Wired when `REGISTRATION_DRIVER=fake`, the default outside production (production rejects it
 * at boot), and injected directly by tests. It passes the port's contract suite like the real
 * adapter. What it does not simulate: the KBA, so an application never finishes or fails on its
 * own, only when a test or developer scripts it; Zulex's validation, so no request is ever
 * rejected; the 404 for an unknown application; or timing of any kind.
 */
export class FakeRegistrationGateway implements RegistrationGateway {
  /** One entry per distinct idempotency key, in filing order. A replayed key adds nothing. */
  readonly submissions: { request: DeregistrationRequest; idempotencyKey: string; applicationId: string }[] = []
  /** Application ids `retry` was called for. */
  readonly retries: string[] = []
  /** What `correct` was asked to change; the fake records it and applies nothing. */
  readonly corrections: { applicationId: string; correction: Correction }[] = []

  private readonly statuses = new Map<string, GatewayStatus>()
  private readonly authorities = new Map<string, RegistrationAuthority[]>()
  private readonly documents = new Map<string, Uint8Array>()
  private readonly failures = new Map<Operation, Error>()

  /** Sets what `getStatus` reports, until `retry` or `correct` restarts the application. */
  setStatus(applicationId: string, status: GatewayStatus): void {
    this.statuses.set(applicationId, status)
  }

  /** Replaces the default online authority for one plate prefix, e.g. to script an offline one. */
  setAuthorities(prefix: string, authorities: RegistrationAuthority[]): void {
    this.authorities.set(prefix, authorities)
  }

  /** Makes a document id fetchable; the id is the string `DocumentRef.id` carries, not a number. */
  setDocument(documentId: string, bytes: Uint8Array): void {
    this.documents.set(documentId, bytes)
  }

  /**
   * Makes the next call of `operation` throw `error`, then clears itself, so a test can model one
   * outage and the recovery after it. A second `failNext` for the same operation replaces the first.
   * Throw the domain errors a real adapter would (`GatewayUnavailable`, `GatewayRejected`).
   */
  failNext(operation: Operation, error: Error): void {
    this.failures.set(operation, error)
  }

  async findAuthorities(licencePlatePrefix: string): Promise<RegistrationAuthority[]> {
    return this.authorities.get(licencePlatePrefix) ?? ONLINE
  }

  async submitDeregistration(request: DeregistrationRequest, idempotencyKey: string) {
    // Before the replay check: a replayed key must still fail when scripted to, as a dropped call would.
    this.throwIfScripted("submit")
    const earlier = this.submissions.find((submission) => submission.idempotencyKey === idempotencyKey)
    if (earlier) return { applicationId: earlier.applicationId }

    // Derived from the key alone, so another instance asked to replay the key answers with the same id.
    const applicationId = `fake-zulex-application-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`
    this.submissions.push({ request, idempotencyKey, applicationId })
    this.statuses.set(applicationId, IN_PROGRESS)
    return { applicationId }
  }

  async getStatus(applicationId: string): Promise<GatewayStatus> {
    this.throwIfScripted("getStatus")
    // Unlike Zulex, an id nobody filed here is no error: on staging another instance may have filed it.
    return this.statuses.get(applicationId) ?? IN_PROGRESS
  }

  /** Accepts any id and restarts it; the real API's retry is meant for an application in ERROR. */
  async retry(applicationId: string): Promise<void> {
    this.throwIfScripted("retry")
    this.retries.push(applicationId)
    this.statuses.set(applicationId, IN_PROGRESS)
  }

  /** Records the correction and restarts the application; the fields are not validated or stored. */
  async correct(applicationId: string, correction: Correction): Promise<void> {
    this.throwIfScripted("correct")
    this.corrections.push({ applicationId, correction })
    this.statuses.set(applicationId, IN_PROGRESS)
  }

  /** An id never given to `setDocument` throws a plain `Error`, like `ZulexRequestFailed` on a 404. */
  async fetchDocument(documentId: string): Promise<Uint8Array> {
    const bytes = this.documents.get(documentId)
    if (!bytes) throw new Error(`FakeRegistrationGateway: unknown document ${documentId}`)
    return bytes
  }

  /** Consumes the scripted failure, so it hits exactly one call. */
  private throwIfScripted(operation: Operation): void {
    const error = this.failures.get(operation)
    if (!error) return
    this.failures.delete(operation)
    throw error
  }
}
