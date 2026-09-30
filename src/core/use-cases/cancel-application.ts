import { applyEvent } from "@/src/core/domain/application"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import type { Dependencies } from "./dependencies"
import { mailRefund } from "./mail-customer"
import { settlePayment } from "./settle-payment"

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
 */
export async function cancelApplication(deps: Dependencies, token: string): Promise<void> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()
  if (application.status === "cancelled") return

  const claimed = await deps.repository.update(application)
  const cancelled = { ...applyEvent(claimed, "cancelledByCustomer", deps.clock.now()), polling: { attempts: claimed.polling.attempts } }
  const settled = await settlePayment(deps, claimed, { type: "cancelled" })
  if (settled.returned.cents > 0) await mailRefund(deps, cancelled, settled.returned)
  await deps.repository.update(cancelled)
}
