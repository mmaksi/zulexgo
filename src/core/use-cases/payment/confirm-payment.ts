import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { applyEvent } from "@/src/core/domain/application/application"
import { requiresIdentityVerification } from "@/src/core/domain/application/application-status"
import { isWhole } from "@/src/core/domain/payment/refund-policy"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { startIdentityVerification } from "@/src/core/use-cases/identity/start-identity-verification"
import { mailCustomer } from "@/src/core/use-cases/mail/mail-customer"
import { submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"

/**
 * The payment provider says the customer paid (the signed Stripe webhook, once a
 * card is held or a payment taken: launch plan Q6; with the fake provider in dev, the
 * simulated payment calls it too). Safe to receive twice: only an application still
 * awaiting payment moves on.
 *
 * Starts the application: status 1, the status link, email 1, then it is handed
 * straight to the KBA submission (launch plan Q5, a provisional answer; a de-registration
 * needs no identity verification, Q4). A service that verifies the customer first
 * (Neuzulassung, Q45) starts the verification instead, and nothing reaches the KBA
 * until the identity is confirmed.
 *
 * Resumable when a step fails, since the provider retries a failed delivery:
 * email 1 goes out before the payment is recorded, so a failed send leaves
 * the application awaiting payment for the retry to redo, with the token it
 * already issued. Once recorded, the application is due for polling at once,
 * so a submission that never happened is picked up by the poller.
 */
export async function confirmPayment(deps: Dependencies, reference: ApplicationReference): Promise<void> {
  const application = await deps.repository.get(reference)
  // An unknown order, or one that already started (a replayed notification): nothing to do.
  if (application?.status !== "awaiting_payment") return

  // The notification only names the order. Whether it was paid is read back from the
  // provider, so the application starts on what the provider shows now.
  const payment = await deps.payments.getPayment(application.payment.id)
  if (payment.status !== "held" && payment.status !== "captured") return
  // The order is filed only for its whole total, with none of it gone back: a partial capture, a partly
  // refunded payment or another amount (all of which only someone acting in the provider's dashboard can
  // cause) is left as it is. Nothing is filed, mailed or issued; the log names the order for someone to look.
  if (!payment.amount.equals(application.payment.total) || !isWhole({ ...payment, total: application.payment.total })) {
    console.warn(`[payments] ${reference}: the payment is not the order's whole total, so the order is not filed`)
    return
  }

  // The first link issued is kept across retries, so a retried email 1 carries the same one.
  if (!(await deps.repository.getStatusToken(reference))) await deps.repository.setStatusToken(reference, deps.tokens.generate())
  const now = deps.clock.now()
  const confirmed = applyEvent(application, "paymentConfirmed", now)
  await mailCustomer(deps, confirmed, "orderConfirmation")
  // Due at once: if the submission below dies, the next tick resumes it.
  const paid = await deps.repository.update({ ...confirmed, polling: { ...confirmed.polling, nextPollAt: now } })
  if (requiresIdentityVerification(paid.request.service)) await startIdentityVerification(deps, paid)
  else await submitToKba(deps, paid)
}
