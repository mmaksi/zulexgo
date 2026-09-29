import type { ApplicationReference } from "@/src/core/domain/application-reference"
import type { Dependencies } from "./dependencies"
import { mailRefund } from "./mail-customer"

/**
 * The payment provider confirms money went back to the customer (Stripe's
 * `charge.refunded` in M4): email 6, with what actually came back. That is
 * whatever the provider did not keep, so it holds for a refund, a released
 * hold and a hold captured down to the fee alike. The email already went out
 * with the refund itself (`handleFailure`); sending it again under the same
 * key delivers nothing, so a replayed provider event is harmless.
 */
export async function confirmRefund(deps: Dependencies, reference: ApplicationReference): Promise<void> {
  const application = await deps.repository.get(reference)
  if (application?.status !== "failed_final" && application?.status !== "cancelled") return

  const payment = await deps.payments.getPayment(application.payment.id)
  const returned = payment.amount.subtract(payment.captured.subtract(payment.refunded))

  await mailRefund(deps, application, returned)
}
