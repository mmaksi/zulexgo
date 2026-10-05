import { applyEvent, type Application } from "@/src/core/domain/application/application"
import { requiresIdentityVerification, type ApplicationEvent } from "@/src/core/domain/application/application-status"
import { applyCorrection, parseCorrection, type OrderCorrectionInput } from "@/src/core/domain/application/correction"
import { applyNewRegistrationCorrection, parseNewRegistrationCorrection } from "@/src/core/domain/application/new-registration-correction"
import type { ServiceRequest } from "@/src/core/domain/application/service"
import { nextPollAt } from "@/src/core/domain/registration/poll-schedule"
import { isWhole } from "@/src/core/domain/payment/refund-policy"
import { GatewayRejected } from "@/src/core/errors/registration/gateway-rejected"
import { PaymentNoLongerWhole } from "@/src/core/errors/payment/payment-no-longer-whole"
import { TokenInvalid } from "@/src/core/errors/application/token-invalid"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { checkIdentityVerification } from "@/src/core/use-cases/identity/check-identity-verification"
import { mailCustomer } from "@/src/core/use-cases/mail/mail-customer"
import { submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"

/**
 * 5b, option A: the customer corrects and the order goes on towards the KBA. Only
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
 * "resubmit a new request"). What the customer may correct is the service's: a
 * de-registration's plate codes and VIN, a Neuzulassung's eVB number and Teil II.
 *
 * A Neuzulassung whose identity was never verified (a verification found someone
 * else than the owner on the order, launch plan Q47) was never filed: the corrected
 * order goes back to status 2 and the verification is read again, at once, so the
 * customer sees the result. Nothing reaches the service for it before that check
 * passes, and a name that still does not match returns it to 5b.
 *
 * Triggered by the correction form on the status page. Throws `TokenInvalid` (no order
 * for the link), `InvalidTransition` (not at 5b), `PaymentNoLongerWhole` (money has gone
 * back, or the payment is not the order's whole total), `ValidationError`
 * (a malformed value, or nothing changed; the values are never named) and `StaleApplication`,
 * all before the service is touched. `GatewayUnavailable` from the service leaves the
 * order at 5b for the customer to try again.
 */
export async function correctApplication(deps: Dependencies, token: string, input: OrderCorrectionInput): Promise<"resubmitted" | "refused"> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()

  // An order the service refused outright (a 400 at submission) has no id: nothing to patch.
  const filed = application.zulexApplicationId !== undefined
  // Whether the order's identity was ever confirmed decides how it goes on: one never confirmed is checked again, not filed.
  const identityVerified = application.history.some(({ status }) => status === "identity_verified")
  const event: ApplicationEvent =
    requiresIdentityVerification(application.request.service) && !identityVerified
      ? "correctionRechecked"
      : filed
        ? "correctionResubmitted"
        : "correctionRefiled"
  // Refuses an order that is not at 5b before anything is read or sent.
  applyEvent(application, event, deps.clock.now())
  const payment = await deps.payments.getPayment(application.payment.id)
  // Judged against the total stored with the order, not the provider's own amount: a payment of another
  // amount is not the one this order was priced at.
  if (!payment.amount.equals(application.payment.total) || !isWhole({ ...payment, total: application.payment.total })) throw new PaymentNoLongerWhole()

  const { applied, send } = corrector(deps, application, input, identityVerified)
  // A new attempt: the failure shown to the customer and the silent retries used belong
  // to the attempt just corrected, so the order starts clean, with its one retry again.
  const withCorrection = (order: Application): Application => ({ ...order, request: applied(), failure: undefined, retryAttempts: 0 })

  if (event === "correctionRechecked") return recheck(deps, withCorrection(application))
  if (!filed) return refile(deps, withCorrection(application))
  const claimed = await deps.repository.update(application)
  return patch(deps, withCorrection(claimed), send)
}

/**
 * What the customer's input does for the order's service: the request with the corrected fields, and the
 * call that gives the service an application it already holds. Parsing throws a `ValidationError` here, before
 * anything is claimed or sent. Only a `Correction` or a `NewRegistrationPatch` can leave this function for the
 * gateway, so a service's literal below makes the compiler check that it gets its own.
 */
function corrector(deps: Dependencies, { request, zulexApplicationId }: Application, input: OrderCorrectionInput, identityVerified: boolean) {
  const id = zulexApplicationId!
  if (request.service === "deregistration") {
    const correction = parseCorrection(input, request.plateCount)
    return {
      applied: (): ServiceRequest => applyCorrection(request, correction),
      send: () => deps.registration.correct("deregistration", id, correction),
    }
  }
  const correction = parseNewRegistrationCorrection(input, { identityVerified }, deps.clock.now())
  return {
    applied: (): ServiceRequest => applyNewRegistrationCorrection(request, correction),
    send: () => deps.registration.correct("newRegistration", id, correction),
  }
}

/**
 * Sends the corrected fields to the service and puts the order back at the KBA, status 4.
 * `refused` (the service rejected the data) leaves the order at 5b, exactly as it was.
 */
async function patch(deps: Dependencies, application: Application, send: () => Promise<void>): Promise<"resubmitted" | "refused"> {
  try {
    // A rerun after the first attempt got this far finds the service already working on it: patching again would send it twice.
    if ((await deps.registration.getStatus(application.request.service, application.zulexApplicationId!)).state !== "inProgress") await send()
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
 * the old one is tied to the refused request (launch plan Q37), back to the status an order is filed
 * from (paid, or verified for a service that verifies) and due at once. The answer is `refused` only if
 * the service refuses the corrected data again, which `submitToKba` handles as it would a first submission
 * (5b, email 5b again).
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

/**
 * Sends an order whose identity was never confirmed back to be checked, status 2, due at once, and reads the
 * provider's answer again now: the verification the customer already completed is compared with the corrected
 * name. Whatever goes wrong in that read, the poller repeats it: the correction itself is done. The answer is
 * `refused` only if the person still does not match, which puts the order back at 5b with email 5b again and the
 * same form to try again. Any other end (filed, or filed and refused by the service for other data) means the
 * correction was taken and the order is no longer the one the form was for, so the page is shown as it now stands.
 */
async function recheck(deps: Dependencies, application: Application): Promise<"resubmitted" | "refused"> {
  const now = deps.clock.now()
  const rechecking = await deps.repository.update({
    ...applyEvent(application, "correctionRechecked", now),
    polling: { attempts: 0, nextPollAt: now },
  })

  await checkIdentityVerification(deps, rechecking).catch((error) => {
    console.error(`[correction] ${rechecking.reference}: the identity check will be repeated: ${error instanceof Error ? error.name : "unknown error"}`)
  })
  const after = await deps.repository.get(rechecking.reference)
  return after?.status === "failed_correctable" && after.failure?.kind === "identityMismatch" ? "refused" : "resubmitted"
}
