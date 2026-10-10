import type { OrderableService, ServiceRequest } from "@/src/core/domain/application/service"
import type { DocumentRef } from "@/src/core/domain/registration/document"
import type { LicencePlate } from "@/src/core/domain/vehicle/licence-plate"
import type { RegistrationAuthority } from "@/src/core/domain/registration/registration-authority"
import type { Secret } from "@/src/core/domain/secret"
import type { SecurityCode } from "@/src/core/domain/vehicle/security-code"
import type { Vin } from "@/src/core/domain/vehicle/vin"

export interface ProcessingError {
  readonly code: number
  // Vendor text: never shown to a customer and never stored.
  readonly description?: string
  readonly details: readonly string[]
}

export type GatewayStatus =
  | { readonly state: "inProgress" }
  | { readonly state: "finished"; readonly documents: readonly DocumentRef[] }
  | { readonly state: "failed"; readonly error: ProcessingError; readonly documents: readonly DocumentRef[] }

export interface Correction {
  readonly licencePlate?: LicencePlate
  readonly vin?: Vin
  readonly codes?: { readonly rearPlate?: SecurityCode; readonly frontPlate?: SecurityCode; readonly certificate?: SecurityCode }
}

// The only fields the vendor's patch takes: owner and vehicle cannot change once filed.
export interface NewRegistrationPatch {
  readonly evbNumber?: Secret<string>
  readonly part2Number?: string
  readonly part2SecurityCode?: Secret<string>
}

export interface Corrections {
  readonly deregistration: Correction
  readonly newRegistration: NewRegistrationPatch
}

// Requests carry secrets: never log them or put them in an error, nor anything the vendor echoes back.
export interface RegistrationGateway {
  findAuthorities(where: { readonly prefix: string } | { readonly postcode: string }): Promise<RegistrationAuthority[]>
  // Whether Zulex honours a replayed key is open (launch plan Q23), so callers store the id first.
  submit(request: ServiceRequest, idempotencyKey: string): Promise<{ applicationId: string }>
  getStatus(service: OrderableService, applicationId: string): Promise<GatewayStatus>
  retry(applicationId: string): Promise<void>
  // Not idempotent: a second patch reaches the KBA again, so callers check getStatus first.
  correct<Service extends OrderableService>(service: Service, applicationId: string, correction: Corrections[Service]): Promise<void>
  fetchDocument(documentId: string): Promise<Uint8Array>
}
