import { applyEvent } from "@/src/core/domain/application/application"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailRefund } from "@/src/core/use-cases/mail/mail-customer"
import { settlePayment } from "@/src/core/use-cases/payment/settle-payment"

/**
 * 5b, option B: the customer gives up. The fee stays, the rest goes back, and
 * email 6 says how much. Only an order waiting for a correction can be
 * cancelled; asking again for one already cancelled does nothing.
 *
 * The order is claimed first, by a version-checked write, so a change made
 * since it was read (a correction in another tab, a poll tick) fails the
 * cancel before any money moves. Then money moves, then the email, then the
 * status, so a failure anywhere leaves the order at 5b for the customer to ask
 * again: settlement recognises what it already did, and email 6 is keyed by the
 * order, so nothing is done or sent twice. A correction refuses an order whose
 * money is no longer whole, so a cancel left half done can only be finished.
 *
 * Triggered by the customer confirming the cancel on the status page. Throws
 * `TokenInvalid` for a link no order answers to, `InvalidTransition` for an order that
 * is not at 5b (before any money moves), and `StaleApplication` for a lost race.
 */
export async function cancelApplication(deps: Dependencies, token: string): Promise<void> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()
  if (application.status === "cancelled") return

  // Saving the order as read is the claim: it bumps the version, so a write that got in
  // since fails here with StaleApplication, before anything below moves money.
  const claimed = await deps.repository.update(application)
  // Refuses (InvalidTransition) an order that is not at 5b. Without a nextPollAt it is
  // no longer due, which ends the daily look at its hold.
  const cancelled = { ...applyEvent(claimed, "cancelledByCustomer", deps.clock.now()), polling: { attempts: claimed.polling.attempts } }
  const settled = await settlePayment(deps, claimed, { type: "cancelled" })
  if (settled.returned.cents > 0) await mailRefund(deps, cancelled, settled.returned)
  await deps.repository.update(cancelled)
}
