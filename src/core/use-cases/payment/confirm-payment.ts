import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { applyEvent } from "@/src/core/domain/application/application"
import { requiresIdentityVerification } from "@/src/core/domain/application/application-status"
import { isWhole } from "@/src/core/domain/payment/refund-policy"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { startIdentityVerification } from "@/src/core/use-cases/identity/start-identity-verification"
import { mailCustomer } from "@/src/core/use-cases/mail/mail-customer"
import { submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"

// Launch plan Q4, Q6; provisional Q5 (filed at once) and Q45 (Neuzulassung verifies identity first).
export async function confirmPayment(deps: Dependencies, reference: ApplicationReference): Promise<void> {
  const application = await deps.repository.get(reference)
  if (application?.status !== "awaiting_payment") return

  const payment = await deps.payments.getPayment(application.payment.id)
  if (payment.status !== "held" && payment.status !== "captured") return
  if (!payment.amount.equals(application.payment.total) || !isWhole({ ...payment, total: application.payment.total })) {
    console.warn(`[payments] ${reference}: the payment is not the order's whole total, so the order is not filed`)
    return
  }

  // Keep the first link across retries, so a retried email 1 carries the same one.
  if (!(await deps.repository.getStatusToken(reference))) await deps.repository.setStatusToken(reference, deps.tokens.generate())
  const now = deps.clock.now()
  const confirmed = applyEvent(application, "paymentConfirmed", now)
  // Mail before saving: a failed send leaves it awaiting payment, and the provider redelivers.
  await mailCustomer(deps, confirmed, "orderConfirmation")
  // Due at once: if the submission below dies, the next tick resumes it.
  const paid = await deps.repository.update({ ...confirmed, polling: { ...confirmed.polling, nextPollAt: now } })
  if (requiresIdentityVerification(paid.request.service)) await startIdentityVerification(deps, paid)
  else await submitToKba(deps, paid)
}
