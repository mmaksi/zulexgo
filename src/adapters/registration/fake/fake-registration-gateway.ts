import type { DeregistrationRequest } from "@/src/core/domain/deregistration-request"
import type { RegistrationAuthority } from "@/src/core/domain/registration-authority"
import type { Correction, GatewayStatus, RegistrationGateway } from "@/src/core/ports/registration-gateway"

type Operation = "submit" | "getStatus" | "retry" | "correct"

const ONLINE: RegistrationAuthority[] = [{ kreiscode: "00000", ikfzStatus: "online" }]
const IN_PROGRESS: GatewayStatus = { state: "inProgress" }

/** Scriptable stand-in for Zulex: set a status, fail the next call, inspect what was sent. */
export class FakeRegistrationGateway implements RegistrationGateway {
  readonly submissions: { request: DeregistrationRequest; idempotencyKey: string; applicationId: string }[] = []
  readonly retries: string[] = []
  readonly corrections: { applicationId: string; correction: Correction }[] = []

  private readonly statuses = new Map<string, GatewayStatus>()
  private readonly authorities = new Map<string, RegistrationAuthority[]>()
  private readonly documents = new Map<string, Uint8Array>()
  private readonly failures = new Map<Operation, Error>()

  setStatus(applicationId: string, status: GatewayStatus): void {
    this.statuses.set(applicationId, status)
  }

  setAuthorities(prefix: string, authorities: RegistrationAuthority[]): void {
    this.authorities.set(prefix, authorities)
  }

  setDocument(documentId: string, bytes: Uint8Array): void {
    this.documents.set(documentId, bytes)
  }

  failNext(operation: Operation, error: Error): void {
    this.failures.set(operation, error)
  }

  async findAuthorities(licencePlatePrefix: string): Promise<RegistrationAuthority[]> {
    return this.authorities.get(licencePlatePrefix) ?? ONLINE
  }

  async submitDeregistration(request: DeregistrationRequest, idempotencyKey: string) {
    this.throwIfScripted("submit")
    const earlier = this.submissions.find((submission) => submission.idempotencyKey === idempotencyKey)
    if (earlier) return { applicationId: earlier.applicationId }

    const applicationId = `fake-zulex-application-${this.submissions.length + 1}`
    this.submissions.push({ request, idempotencyKey, applicationId })
    this.statuses.set(applicationId, IN_PROGRESS)
    return { applicationId }
  }

  async getStatus(applicationId: string): Promise<GatewayStatus> {
    this.throwIfScripted("getStatus")
    const status = this.statuses.get(applicationId)
    if (!status) throw new Error(`FakeRegistrationGateway: unknown application ${applicationId}`)
    return status
  }

  async retry(applicationId: string): Promise<void> {
    this.throwIfScripted("retry")
    this.retries.push(applicationId)
    this.statuses.set(applicationId, IN_PROGRESS)
  }

  async correct(applicationId: string, correction: Correction): Promise<void> {
    this.throwIfScripted("correct")
    this.corrections.push({ applicationId, correction })
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
