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

type Operation = "submit" | "getStatus" | "retry" | "correct"

const ONLINE: RegistrationAuthority[] = [{ kreiscode: "00000", ikfzStatus: "online" }]
const IN_PROGRESS: GatewayStatus = { state: "inProgress" }

export class FakeRegistrationGateway implements RegistrationGateway {
  readonly submissions: { request: ServiceRequest; idempotencyKey: string; applicationId: string }[] = []
  readonly retries: string[] = []
  readonly corrections: { applicationId: string; correction: Correction }[] = []
  readonly patches: { applicationId: string; patch: NewRegistrationPatch }[] = []

  private readonly statuses = new Map<string, GatewayStatus>()
  private readonly authorities = new Map<string, RegistrationAuthority[]>()
  private readonly documents = new Map<string, Uint8Array>()
  private readonly failures = new Map<Operation, Error>()
  private readonly recorders: { [Service in OrderableService]: (applicationId: string, correction: Corrections[Service]) => void } = {
    deregistration: (applicationId, correction) => this.corrections.push({ applicationId, correction }),
    newRegistration: (applicationId, patch) => this.patches.push({ applicationId, patch }),
  }

  setStatus(applicationId: string, status: GatewayStatus): void {
    this.statuses.set(applicationId, status)
  }

  setAuthorities(where: string, authorities: RegistrationAuthority[]): void {
    this.authorities.set(where, authorities)
  }

  setDocument(documentId: string, bytes: Uint8Array): void {
    this.documents.set(documentId, bytes)
  }

  failNext(operation: Operation, error: Error): void {
    this.failures.set(operation, error)
  }

  async findAuthorities(where: { prefix: string } | { postcode: string }): Promise<RegistrationAuthority[]> {
    return this.authorities.get("prefix" in where ? where.prefix : where.postcode) ?? ONLINE
  }

  async submit(request: ServiceRequest, idempotencyKey: string) {
    // Before the replay check, so a replayed key still fails when scripted to, as a dropped call would.
    this.throwIfScripted("submit")
    const earlier = this.submissions.find((submission) => submission.idempotencyKey === idempotencyKey)
    if (earlier) return { applicationId: earlier.applicationId }

    // Derived from the key alone, so another instance asked to replay the key answers with the same id.
    const applicationId = `fake-zulex-application-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`
    this.submissions.push({ request, idempotencyKey, applicationId })
    this.statuses.set(applicationId, IN_PROGRESS)
    return { applicationId }
  }

  async getStatus(_service: OrderableService, applicationId: string): Promise<GatewayStatus> {
    this.throwIfScripted("getStatus")
    // Unlike Zulex, an id nobody filed here is no error: on staging another instance may have filed it.
    return this.statuses.get(applicationId) ?? IN_PROGRESS
  }

  async retry(applicationId: string): Promise<void> {
    this.throwIfScripted("retry")
    this.retries.push(applicationId)
    this.statuses.set(applicationId, IN_PROGRESS)
  }

  async correct<Service extends OrderableService>(service: Service, applicationId: string, correction: Corrections[Service]): Promise<void> {
    this.throwIfScripted("correct")
    this.recorders[service](applicationId, correction)
    this.statuses.set(applicationId, IN_PROGRESS)
  }

  async fetchDocument(documentId: string): Promise<Uint8Array> {
    const bytes = this.documents.get(documentId)
    if (!bytes) throw new Error(`FakeRegistrationGateway: unknown document ${documentId}`)
    return bytes
  }

  private throwIfScripted(operation: Operation): void {
    const error = this.failures.get(operation)
    if (!error) return
    this.failures.delete(operation)
    throw error
  }
}
