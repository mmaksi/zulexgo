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
 * Money moves first, then the email, then the status, so a failure anywhere
 * leaves the order at 5b for the customer to ask again: settlement recognises
 * what it already did, and email 6 is keyed by the order, so nothing is done
 * or sent twice.
 */
export async function cancelApplication(deps: Dependencies, token: string): Promise<void> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()
  if (application.status === "cancelled") return

  const cancelled = { ...applyEvent(application, "cancelledByCustomer", deps.clock.now()), polling: { attempts: application.polling.attempts } }
  const settled = await settlePayment(deps, application, { type: "cancelled" })
  if (settled.returned.cents > 0) await mailRefund(deps, cancelled, settled.returned)
  await deps.repository.update(cancelled)
}
