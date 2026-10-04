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

/** How many characters of the VIN, counted from the end, the page shows. */
const VIN_VISIBLE = 4

/** What every service's status page shows. */
interface StatusViewBase {
  readonly reference: Application["reference"]
  readonly status: Application["status"]
  readonly steps: CustomerStep[]
  /** What the customer may download: the ids to ask the download route for, confirmation first. */
  readonly documents: readonly DocumentRef[]
  /** For an order at 5b or 5c: what went wrong, in our words. */
  readonly failureReason?: string
  /** For an order at 5b: whether it can still be corrected. Not once part of its money has gone back (a cancel begun and not finished). */
  readonly correctable?: boolean
  /** For an order at 5b: what cancelling would return and what the fee would keep, shown beside the cancel button. */
  readonly cancellation?: { readonly returned: Money; readonly retained: Money }
  /** For an order that ended without a result: what went back and what we kept. Absent when the provider cannot say. */
  readonly refund?: { readonly returned: Money; readonly retained: Money }
}

/**
 * Everything the status page may show, and nothing more: the plate and the end
 * of the VIN identify the vehicle; the security codes never leave the server.
 */
export interface DeregistrationStatusView extends StatusViewBase {
  readonly service: "deregistration"
  readonly licencePlate: LicencePlate
  /** One or two: a correction asks for the front plate's code only when there is a front plate. */
  readonly plateCount: 1 | 2
  readonly vinEnding: string
}

/**
 * A Neuzulassung is known by the end of its VIN for now: it has no plate until the authority assigns
 * one, and what its customer typed (the owner, the address, the bank account, the eVB number and the
 * Teil II code) never leaves the server.
 */
export interface NewRegistrationStatusView extends StatusViewBase {
  readonly service: "newRegistration"
  readonly vinEnding: string
}

/**
 * One member per service, each with the summary of what that service's order is about, so the
 * page picks its summary and its correction form by `service`.
 */
export type StatusView = DeregistrationStatusView | NewRegistrationStatusView

/**
 * What the status page shows for a link, rebuilt from our own record on every page view
 * and refresh. Reads only. An unknown or empty link throws `TokenInvalid`, the same
 * answer whatever the reason; the caller counts the lookup against the requester's
 * address before calling.
 *
 * The payment provider and the document store are asked only for the states that show
 * something from them: the money at 5b, 5c and a cancel, the documents once the order
 * has completed. Whatever they fail to answer costs that part of the page, never the
 * page itself.
 */
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
      : { service: request.service, vinEnding }
  return {
    ...summary,
    reference,
    status,
    steps: customerSteps(application),
    failureReason: failureReasonOf(application, deps.errorCatalogue),
    // Only a de-registration has a correction to offer; a Neuzulassung's is not built yet.
    correctable: status === "failed_correctable" && request.service === "deregistration" ? await correctableOf(deps.payments, application) : undefined,
    // A preview from the price, beside the cancel button: all but the fee would go back.
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

/** An order whose provider cannot be asked is offered the form: correcting asks again before it sends anything. */
async function correctableOf(payments: Pick<PaymentProvider, "getPayment">, { payment }: Application): Promise<boolean> {
  try {
    const paid = await payments.getPayment(payment.id)
    return isWhole({ ...paid, total: paid.amount })
  } catch {
    return true
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
