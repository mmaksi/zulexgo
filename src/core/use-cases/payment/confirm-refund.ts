import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { retainedOf } from "@/src/core/domain/payment/refund-policy"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailRefund } from "@/src/core/use-cases/mail/mail-customer"

/**
 * The payment provider confirms money went back to the customer (Stripe's
 * `charge.refunded`, once it is wired): email 6, with what actually came back. That is
 * whatever the provider did not keep, so it holds for a refund, a released
 * hold and a hold captured down to the fee alike. The email already went out
 * with the refund itself (`handleFailure`, `cancelApplication`); sending it again
 * under the same key delivers nothing, so a replayed provider event is harmless.
 *
 * No route calls this yet, only tests: the Stripe webhook is not subscribed to
 * `charge.refunded` (launch plan Q35, which says how to wire it should email 6 wait
 * for the provider). An order that did not end in a refund or a cancel is ignored.
 */
export async function confirmRefund(deps: Dependencies, reference: ApplicationReference): Promise<void> {
  const application = await deps.repository.get(reference)
  if (application?.status !== "failed_final" && application?.status !== "cancelled") return

  // Read off the payment, as the status page does, so the page and email 6 agree.
  const payment = await deps.payments.getPayment(application.payment.id)
  const returned = payment.amount.subtract(retainedOf(payment))

  await mailRefund(deps, application, returned)
}
