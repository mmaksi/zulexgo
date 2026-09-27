import type { ApplicationReference } from "@/src/core/domain/application-reference"
import { applyEvent } from "@/src/core/domain/application"
import type { Dependencies } from "./dependencies"
import { mailCustomer } from "./mail-customer"
import { submitToKba } from "./submit-to-kba"

/**
 * The payment provider says the customer paid (a Stripe webhook in M4). Safe
 * to receive twice: only an application still awaiting payment moves on.
 */
export async function confirmPayment(deps: Dependencies, reference: ApplicationReference): Promise<void> {
  const application = await deps.repository.get(reference)
  if (application?.status !== "awaiting_payment") return

  const payment = await deps.payments.getPayment(application.payment.id)
  if (payment.status !== "held" && payment.status !== "captured") return

  await deps.repository.setStatusToken(reference, deps.tokens.generate())
  const paid = await deps.repository.update(applyEvent(application, "paymentConfirmed", deps.clock.now()))
  await mailCustomer(deps, paid, "orderConfirmation")
  await submitToKba(deps, paid)
}
