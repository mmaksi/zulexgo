import type { ApplicationReference } from "@/src/core/domain/application-reference"
import { applyEvent } from "@/src/core/domain/application"
import type { Dependencies } from "./dependencies"
import { mailCustomer } from "./mail-customer"
import { submitToKba } from "./submit-to-kba"

/**
 * The payment provider says the customer paid (a Stripe webhook in M4). Safe
 * to receive twice: only an application still awaiting payment moves on.
 *
 * Resumable when a step fails, since the provider retries a failed delivery:
 * email 1 goes out before the payment is recorded, so a failed send leaves
 * the application awaiting payment for the retry to redo, with the token it
 * already issued. Once recorded, the application is due for polling at once,
 * so a submission that never happened is picked up by the poller.
 */
export async function confirmPayment(deps: Dependencies, reference: ApplicationReference): Promise<void> {
  const application = await deps.repository.get(reference)
  if (application?.status !== "awaiting_payment") return

  const payment = await deps.payments.getPayment(application.payment.id)
  if (payment.status !== "held" && payment.status !== "captured") return

  if (!(await deps.repository.getStatusToken(reference))) await deps.repository.setStatusToken(reference, deps.tokens.generate())
  const now = deps.clock.now()
  const confirmed = applyEvent(application, "paymentConfirmed", now)
  await mailCustomer(deps, confirmed, "orderConfirmation")
  const paid = await deps.repository.update({ ...confirmed, polling: { ...confirmed.polling, nextPollAt: now } })
  await submitToKba(deps, paid)
}
