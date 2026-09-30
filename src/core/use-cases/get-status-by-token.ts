import { customerSteps, type CustomerStep } from "@/src/core/domain/customer-steps"
import type { Application } from "@/src/core/domain/application"
import { DOCUMENT_KINDS, type DocumentRef } from "@/src/core/domain/document"
import type { LicencePlate } from "@/src/core/domain/licence-plate"
import type { Money } from "@/src/core/domain/money"
import { PROCESSING_FEE } from "@/src/core/domain/pricing"
import { reasonFor, type RejectionCatalogue } from "@/src/core/domain/rejection-catalogue"
import { retainedOf } from "@/src/core/domain/refund-policy"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import type { DocumentStore } from "@/src/core/ports/document-store"
import type { PaymentProvider } from "@/src/core/ports/payment-provider"

const VIN_VISIBLE = 4

/**
 * Everything the status page may show, and nothing more: the plate and the end
 * of the VIN identify the vehicle; the security codes never leave the server.
 */
export interface StatusView {
  readonly reference: Application["reference"]
  readonly status: Application["status"]
  readonly licencePlate: LicencePlate
  /** One or two: a correction asks for the front plate's code only when there is a front plate. */
  readonly plateCount: 1 | 2
  readonly vinEnding: string
  readonly steps: CustomerStep[]
  /** What the customer may download: the ids to ask the download route for, confirmation first. */
  readonly documents: readonly DocumentRef[]
  /** For an order at 5b or 5c: what went wrong, in our words. */
  readonly failureReason?: string
  /** For an order at 5b: what cancelling would return and what the fee would keep, shown beside the cancel button. */
  readonly cancellation?: { readonly returned: Money; readonly retained: Money }
  /** For an order that ended without a result: what went back and what we kept. Absent when the provider cannot say. */
  readonly refund?: { readonly returned: Money; readonly retained: Money }
}

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
  return {
    reference,
    status,
    licencePlate: request.licencePlate,
    plateCount: request.plateCount,
    vinEnding: request.vin.slice(-VIN_VISIBLE),
    steps: customerSteps(application),
    failureReason: failureReasonOf(application, deps.errorCatalogue),
    cancellation: status === "failed_correctable" ? { returned: application.payment.total.subtract(PROCESSING_FEE), retained: PROCESSING_FEE } : undefined,
    documents: await documentsOf(deps.documents, application),
    refund: await refundOf(deps.payments, application),
  }
}

/** An order stored before failures were kept has none, and reads as the general wording. */
function failureReasonOf({ status, failure }: Application, catalogue?: RejectionCatalogue): string | undefined {
  if (status !== "failed_correctable" && status !== "failed_final") return undefined
  return reasonFor(failure ?? { kind: "rejected" }, catalogue)
}

/**
 * Only a finished order has documents, and only they are stored, so no other
 * page asks the store. A store that cannot be read costs the downloads, not
 * the page: the customer still sees where the order stands.
 */
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

/** Read off the payment as `confirmRefund` does, so the page and email 6 agree. A page that cannot say still renders. */
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
