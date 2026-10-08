import { createHash } from "node:crypto"
import type { OrderableService, ServiceRequest } from "@/src/core/domain/application/service"
import type { RegistrationAuthority } from "@/src/core/domain/registration/registration-authority"
import type {
  Correction,
  Corrections,
  GatewayStatus,
  NewRegistrationPatch,
  RegistrationGateway,
} from "@/src/core/ports/registration/registration-gateway"

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
  readonly submissions: { request: ServiceRequest; idempotencyKey: string; applicationId: string }[] = []
  /** Application ids `retry` was called for. */
  readonly retries: string[] = []
  /** What `correct` was asked to change on a de-registration; the fake records it and applies nothing. */
  readonly corrections: { applicationId: string; correction: Correction }[] = []
  /** What `correct` was asked to change on a Neuzulassung, recorded the same way. */
  readonly patches: { applicationId: string; patch: NewRegistrationPatch }[] = []

  private readonly statuses = new Map<string, GatewayStatus>()
  private readonly authorities = new Map<string, RegistrationAuthority[]>()
  private readonly documents = new Map<string, Uint8Array>()
  private readonly failures = new Map<Operation, Error>()
  private readonly recorders: { [Service in OrderableService]: (applicationId: string, correction: Corrections[Service]) => void } = {
    deregistration: (applicationId, correction) => this.corrections.push({ applicationId, correction }),
    newRegistration: (applicationId, patch) => this.patches.push({ applicationId, patch }),
  }

  /** Sets what `getStatus` reports, until `retry` or `correct` restarts the application. */
  setStatus(applicationId: string, status: GatewayStatus): void {
    this.statuses.set(applicationId, status)
  }

  /** Replaces the default online authority for one plate prefix or postcode, e.g. to script an offline one. */
  setAuthorities(where: string, authorities: RegistrationAuthority[]): void {
    this.authorities.set(where, authorities)
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

  async findAuthorities(where: { prefix: string } | { postcode: string }): Promise<RegistrationAuthority[]> {
    return this.authorities.get("prefix" in where ? where.prefix : where.postcode) ?? ONLINE
  }

  async submit(request: ServiceRequest, idempotencyKey: string) {
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

  /** The service changes nothing here: the fake keeps one table of statuses for every service. */
  async getStatus(_service: OrderableService, applicationId: string): Promise<GatewayStatus> {
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
  async correct<Service extends OrderableService>(service: Service, applicationId: string, correction: Corrections[Service]): Promise<void> {
    this.throwIfScripted("correct")
    this.recorders[service](applicationId, correction)
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
