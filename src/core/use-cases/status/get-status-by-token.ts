import { customerSteps, type CustomerStep } from "@/src/core/domain/application/customer-steps"
import type { Application } from "@/src/core/domain/application/application"
import { DOCUMENT_KINDS, type DocumentRef } from "@/src/core/domain/registration/document"
import type { LicencePlate } from "@/src/core/domain/vehicle/licence-plate"
import type { Money } from "@/src/core/domain/payment/money"
import { PROCESSING_FEE } from "@/src/core/domain/payment/pricing"
import { reasonFor, type RejectionCatalogue } from "@/src/core/domain/registration/rejection-catalogue"
import { isWhole, retainedOf } from "@/src/core/domain/payment/refund-policy"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { ApplicationRepository } from "@/src/core/ports/repository/application-repository"
import type { DocumentStore } from "@/src/core/ports/storage/document-store"
import type { PaymentProvider } from "@/src/core/ports/payment/payment-provider"

const VIN_VISIBLE = 4

interface StatusViewBase {
  readonly reference: Application["reference"]
  readonly status: Application["status"]
  readonly steps: CustomerStep[]
  readonly documents: readonly DocumentRef[]
  readonly failureReason?: string
  readonly correctable?: boolean
  readonly cancellation?: { readonly returned: Money; readonly retained: Money }
  readonly refund?: { readonly returned: Money; readonly retained: Money }
}

// What the page may show and nothing more: security codes never leave the server.
export interface DeregistrationStatusView extends StatusViewBase {
  readonly service: "deregistration"
  readonly licencePlate: LicencePlate
  readonly plateCount: 1 | 2
  readonly vinEnding: string
}

// What the customer typed (owner, address, bank account, eVB, Teil II) never leaves the server.
export interface NewRegistrationStatusView extends StatusViewBase {
  readonly service: "newRegistration"
  readonly vinEnding: string
  readonly ownerCorrectable?: boolean
  readonly verificationDeadline?: Date
}

export type StatusView = DeregistrationStatusView | NewRegistrationStatusView

// One answer for every bad link; the caller rate-limits by address first.
export async function getStatusByToken(
  deps: {
    repository: Pick<ApplicationRepository, "findByStatusToken">
    documents: Pick<DocumentStore, "list">
    payments: Pick<PaymentProvider, "getPayment">
    errorCatalogue?: RejectionCatalogue
  },
  token: string,
): Promise<StatusView> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()

  const { reference, status, request } = application
  const vinEnding = request.vin.slice(-VIN_VISIBLE)
  const summary =
    request.service === "deregistration"
      ? { service: request.service, licencePlate: request.licencePlate, plateCount: request.plateCount, vinEnding }
      : {
          service: request.service,
          vinEnding,
          ownerCorrectable: status === "failed_correctable" ? !application.history.some((change) => change.status === "identity_verified") : undefined,
          verificationDeadline: status === "awaiting_identity_verification" ? application.identityVerification?.deadline : undefined,
        }
  return {
    ...summary,
    reference,
    status,
    steps: customerSteps(application),
    failureReason: failureReasonOf(application, deps.errorCatalogue),
    correctable: status === "failed_correctable" ? await correctableOf(deps.payments, application) : undefined,
    cancellation: status === "failed_correctable" ? { returned: application.payment.total.subtract(PROCESSING_FEE), retained: PROCESSING_FEE } : undefined,
    documents: await documentsOf(deps.documents, application),
    refund: await refundOf(deps.payments, application),
  }
}

function failureReasonOf({ status, failure }: Application, catalogue?: RejectionCatalogue): string | undefined {
  if (status !== "failed_correctable" && status !== "failed_final") return undefined
  return reasonFor(failure ?? { kind: "rejected" }, catalogue)
}

async function documentsOf(store: Pick<DocumentStore, "list">, { reference, status }: Application): Promise<DocumentRef[]> {
  if (status !== "completed") return []
  try {
    return [...(await store.list(reference))].sort(
      (a, b) => DOCUMENT_KINDS.indexOf(a.kind) - DOCUMENT_KINDS.indexOf(b.kind) || a.id.localeCompare(b.id),
    )
  } catch (error) {
    console.error(`[status] ${reference}: documents not listed: ${error instanceof Error ? error.name : "unknown error"}`)
    return []
  }
}

// Fails open: correcting checks the payment again before it sends anything.
async function correctableOf(payments: Pick<PaymentProvider, "getPayment">, { payment }: Application): Promise<boolean> {
  try {
    const paid = await payments.getPayment(payment.id)
    return isWhole({ ...paid, total: paid.amount })
  } catch {
    return true
  }
}

async function refundOf(payments: Pick<PaymentProvider, "getPayment">, { status, payment }: Application): Promise<StatusView["refund"]> {
  if (status !== "failed_final" && status !== "cancelled") return undefined
  try {
    const paid = await payments.getPayment(payment.id)
    const retained = retainedOf(paid)
    return { returned: paid.amount.subtract(retained), retained }
  } catch {
    return undefined
  }
}
