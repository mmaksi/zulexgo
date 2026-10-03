import { applyEvent, type Application } from "@/src/core/domain/application/application"
import { applyCorrection, parseCorrection, type CorrectionInput } from "@/src/core/domain/application/correction"
import { nextPollAt } from "@/src/core/domain/registration/poll-schedule"
import { isWhole } from "@/src/core/domain/payment/refund-policy"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { PaymentNoLongerWhole } from "@/src/core/errors/payment/payment-no-longer-whole"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { Correction } from "@/src/core/ports/registration/registration-gateway"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailCustomer } from "@/src/core/use-cases/mail/mail-customer"
import { submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"

/**
 * 5b, option A: the customer corrects and the order goes back to the KBA. Only
 * an order waiting for a correction can be corrected, and nothing changes
 * until the service has taken the new data: `refused` means it did not, and the
 * order is left as it was. Launch plan Q11: a correction never costs more.
 *
 * Two guards keep an order from reaching the KBA when it must not. Its money
 * must still be whole: a cancel that got part of the way, or a hold that
 * lapsed, has already returned some of it (`PaymentNoLongerWhole`). And the
 * order is claimed, by a version-checked write, before anything is sent, so a
 * cancel or a poll tick that got in first fails this before the service is
 * touched: the service cannot be told to forget a patch.
 *
 * An order the service holds is patched and returns to status 4, with email 4
 * again. One it refused outright holds nothing to patch, so the corrected
 * order is filed afresh under a new idempotency key (the service's 400 says
 * "resubmit a new request").
 *
 * Triggered by the correction form on the status page. Throws `TokenInvalid` (no order
 * for the link), `InvalidTransition` (not at 5b), `PaymentNoLongerWhole` (money has gone
 * back, or the payment is not the order's whole total), `ValidationError`
 * (a malformed value, or nothing changed; the values are never named) and `StaleApplication`,
 * all before the service is touched. `GatewayUnavailable` from the service leaves the
 * order at 5b for the customer to try again.
 */
export async function correctApplication(deps: Dependencies, token: string, input: CorrectionInput): Promise<"resubmitted" | "refused"> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()

  // An order the service refused outright (a 400 at submission) has no id: nothing to patch.
  const filed = application.zulexApplicationId !== undefined
  // Refuses an order that is not at 5b before anything is read or sent.
  applyEvent(application, filed ? "correctionResubmitted" : "correctionRefiled", deps.clock.now())
  const payment = await deps.payments.getPayment(application.payment.id)
  // Judged against the total stored with the order, not the provider's own amount: a payment of another
  // amount is not the one this order was priced at.
  if (!payment.amount.equals(application.payment.total) || !isWhole({ ...payment, total: application.payment.total })) throw new PaymentNoLongerWhole()

  const correction = parseCorrection(input, application.request.plateCount)
  // A new attempt: the failure shown to the customer and the silent retries used belong
  // to the attempt just corrected, so the order starts clean, with its one retry again.
  const withCorrection = (order: Application): Application => ({
    ...order,
    request: applyCorrection(order.request, correction),
    failure: undefined,
    retryAttempts: 0,
  })

  if (!filed) return refile(deps, withCorrection(application))
  const claimed = await deps.repository.update(application)
  return patch(deps, withCorrection(claimed), application.zulexApplicationId!, correction)
}

/**
 * Sends the corrected fields to the service and puts the order back at the KBA, status 4.
 * `refused` (the service rejected the data) leaves the order at 5b, exactly as it was.
 */
async function patch(deps: Dependencies, application: Application, zulexId: string, correction: Correction): Promise<"resubmitted" | "refused"> {
  const { service } = application.request
  try {
    // A rerun after the first attempt got this far finds the service already working on it: patching again would send it twice.
    if ((await deps.registration.getStatus(service, zulexId)).state !== "inProgress") await deps.registration.correct(service, zulexId, correction)
  } catch (error) {
    if (error instanceof GatewayRejected) return "refused"
    throw error
  }

  const now = deps.clock.now()
  // The new attempt is polled from the start of the schedule.
  const resubmitted = {
    ...applyEvent(application, "correctionResubmitted", now),
    polling: { attempts: 0, nextPollAt: nextPollAt({ ikfzStatus: application.ikfzStatus, attempts: 0, now }) },
  }
  // The status first, unlike the other emails: the service is already working on the order, and one left at 5b would never
  // be polled again. The email only repeats email 4, so losing it is logged, not the price of an order the customer cannot see move.
  await deps.repository.update(resubmitted)
  await mailCustomer(deps, resubmitted, "submittedToKba").catch((error) => {
    console.error(`[correction] ${resubmitted.reference}: the email that the order is back at the KBA was not sent: ${error instanceof Error ? error.name : "unknown error"}`)
  })
  return "resubmitted"
}

/**
 * Files an order the service never held as if it were new: a fresh idempotency key, since
 * the old one is tied to the refused request (launch plan Q37), back to status 1 and due
 * at once. The answer is `refused` only if the service refuses the corrected data again,
 * which `submitToKba` handles as it would a first submission (5b, email 5b again).
 */
async function refile(deps: Dependencies, application: Application): Promise<"resubmitted" | "refused"> {
  const now = deps.clock.now()
  const refiled = await deps.repository.update({
    ...applyEvent(application, "correctionRefiled", now),
    idempotencyKey: deps.tokens.generate(),
    polling: { attempts: 0, nextPollAt: now },
  })

  // Whatever goes wrong now, the poller resumes the submission: the correction itself is done.
  await submitToKba(deps, refiled).catch((error) => {
    console.error(`[correction] ${refiled.reference}: filing will be retried: ${error instanceof Error ? error.name : "unknown error"}`)
  })
  return (await deps.repository.get(refiled.reference))?.status === "failed_correctable" ? "refused" : "resubmitted"
}
