import { applyEvent } from "@/src/core/domain/application/application"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailRefund } from "@/src/core/use-cases/mail/mail-customer"
import { settlePayment } from "@/src/core/use-cases/payment/settle-payment"

// Claim, then money, email, status: a failure leaves the order at 5b, and every step reruns safely.
export async function cancelApplication(deps: Dependencies, token: string): Promise<void> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()
  if (application.status === "cancelled") return

  // Saving as read is the claim: a write since fails here (StaleApplication) before money moves.
  const claimed = await deps.repository.update(application)
  // InvalidTransition before money moves; dropping nextPollAt ends the daily look at its hold.
  const cancelled = { ...applyEvent(claimed, "cancelledByCustomer", deps.clock.now()), polling: { attempts: claimed.polling.attempts } }
  const settled = await settlePayment(deps, claimed, { type: "cancelled" })
  if (settled.returned.cents > 0) await mailRefund(deps, cancelled, settled.returned)
  await deps.repository.update(cancelled)
}
