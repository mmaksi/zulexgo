import { applyEvent, verificationStartedAt, type Application } from "@/src/core/domain/application/application"
import type { Owner } from "@/src/core/domain/customer/owner"
import { isTheOwner, type VerifiedPerson } from "@/src/core/domain/customer/verified-person"
import type { ServiceRequest } from "@/src/core/domain/application/service"
import { nextVerificationCheckAt, verificationDue } from "@/src/core/domain/payment/verification-policy"
import type { Failure } from "@/src/core/domain/registration/failure"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailCustomer, mailRefund, mailVerificationLink } from "@/src/core/use-cases/mail/mail-customer"
import { guardHoldQuietly } from "@/src/core/use-cases/payment/secure-hold"
import { settlePayment } from "@/src/core/use-cases/payment/settle-payment"
import { handleFailure } from "@/src/core/use-cases/registration/handle-failure"
import { afterFailure, submitToKba } from "@/src/core/use-cases/registration/submit-to-kba"

/**
 * Looks at an order that waits for the customer to verify their identity (status 2) and does what the provider's
 * answer calls for. Run by the poller for every such order that is due, and by the provider's signed callback.
 * Both only ever read the answer with `getResult`: nothing in a callback is acted on. Safe to repeat: an order
 * that is no longer at status 2 is left alone.
 *
 * The answer first, then the clock, so a customer who verified before the deadline is accepted even if the
 * poller reads it late:
 * - verified, and the person is the owner on the order: status 3, email 3, then the order is filed.
 * - verified, but someone else (launch plan Q47, provisional): nothing was filed, so 5b, and the customer corrects the
 *   name and birth date.
 * - failed: 5c, the fee kept and the rest back (business logic §2).
 * - still pending: past the deadline the order is cancelled and everything goes back, since nothing was filed; the
 *   reminder is sent once when it falls due; otherwise the poller is scheduled for the next look, never later than
 *   the reminder or the deadline. The card hold is looked at on every such visit, after the deadline, so a hold
 *   about to lapse is never captured for an order that is cancelled.
 *
 * A failure anywhere leaves the order at status 2, which the poller backs off, and every step is safe to rerun.
 */
export async function checkIdentityVerification(deps: Dependencies, application: Application): Promise<void> {
  if (application.status !== "awaiting_identity_verification") return
  const verification = application.identityVerification
  if (!verification) throw new Error(`Application ${application.reference} waits for a verification it never started`)

  const result = await deps.identity.getResult(verification.id)
  if (result.status === "failed") return endWithout(deps, application, { kind: "identityFailed" })
  if (result.status === "verified") return accept(deps, application, result.person)
  return waitForCustomer(deps, application, verification)
}

/** The keeper whose identity is checked. Only a service that has an owner on its request verifies. */
function ownerOn(request: ServiceRequest): Owner {
  if (request.service === "newRegistration") return request.owner
  throw new Error(`An order for ${request.service} has no owner to verify`)
}

/**
 * The provider verified someone. Email 3 goes out before the status is saved, so a failed send leaves the order at
 * status 2 for the poller to back off and redo. Saving the status is version-checked: a tick that read `pending` a
 * moment ago and cancelled the order first (`expire`) makes this write fail instead of filing a cancelled order, though
 * its email 3 may already have gone out.
 */
async function accept(deps: Dependencies, application: Application, person: VerifiedPerson): Promise<void> {
  if (!isTheOwner(person, ownerOn(application.request))) return endWithout(deps, application, { kind: "identityMismatch" })

  const now = deps.clock.now()
  // Due at once: if the filing below dies, the next tick resumes it from status 3.
  const verified: Application = { ...applyEvent(application, "identityVerified", now), polling: { attempts: 0, nextPollAt: now } }
  await mailCustomer(deps, verified, "identityVerified")
  await submitToKba(deps, await deps.repository.update(verified))
}

/** Failed or not the owner: the error algorithm decides, and an identity failure is never retried. */
function endWithout(deps: Dependencies, application: Application, failure: Failure): Promise<void> {
  return handleFailure(deps, application, failure, async () => {
    throw new Error("An identity verification is never retried")
  })
}

async function waitForCustomer(deps: Dependencies, application: Application, verification: NonNullable<Application["identityVerification"]>): Promise<void> {
  const now = deps.clock.now()
  const waiting = { startedAt: verificationStartedAt(application.history)!, deadline: verification.deadline, reminderSent: verification.reminderSent }
  const due = verificationDue(waiting, now)
  if (due === "expired") return expire(deps, application)

  if (due === "remind") await remind(deps, application)
  await guardHoldQuietly(deps, application)

  const attempts = application.polling.attempts + 1
  const reminderSent = verification.reminderSent || due === "remind"
  await deps.repository.update({
    ...application,
    identityVerification: { ...verification, reminderSent },
    polling: { attempts, nextPollAt: nextVerificationCheckAt({ ...waiting, reminderSent, attempts, now }) },
  })
}

/** The same link as email 2: the provider returns the verification already opened for the order. */
async function remind(deps: Dependencies, application: Application): Promise<void> {
  const { link } = await deps.identity.start({ reference: application.reference, email: application.email })
  await mailVerificationLink(deps, application, "identityVerificationReminder", link)
}

/**
 * The deadline passed with nothing finished (launch plan Q48, provisional): nothing was filed, so the hold is released
 * in full (or a captured payment refunded in full) and email 6 says so. Claimed first, like a cancel, so money never
 * moves for an order another writer has just taken on; then money, then email, then status, so a failure anywhere
 * leaves the order at status 2 for the next tick, whose settlement recognises what was already done. The claim bumped
 * the version, so the poller's own backoff write would be refused as stale: a failure backs off against the claimed copy here.
 *
 * The claim excludes a writer that read the order BEFORE it, not one that reads it after: the status is still 2, so a
 * callback arriving at that very instant could read `verified` and file the order while this releases the hold. Money is
 * not lost (a released hold is never filed for: `submitToKba` fails such an order with everything refunded) except in the
 * milliseconds between that read of the payment and the release; closing it needs a state a reader can see, which a
 * cancel (`cancelApplication`) has the same gap for. It takes a customer finishing at the deadline to the second.
 */
async function expire(deps: Dependencies, application: Application): Promise<void> {
  const claimed = await deps.repository.update(application)
  try {
    const settled = await settlePayment(deps, claimed, { type: "verificationExpired" })
    // No nextPollAt: a cancelled order is never looked at again.
    const cancelled: Application = { ...applyEvent(claimed, "identityVerificationExpired", deps.clock.now()), polling: { attempts: claimed.polling.attempts } }
    if (settled.returned.cents > 0) await mailRefund(deps, cancelled, settled.returned)
    await deps.repository.update(cancelled)
  } catch (error) {
    await deps.repository.update(afterFailure(deps, claimed)).catch(() => undefined)
    throw error
  }
}
