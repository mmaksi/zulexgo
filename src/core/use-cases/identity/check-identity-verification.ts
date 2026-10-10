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

// The answer before the clock: a customer verified before the deadline is accepted even when read late.
export async function checkIdentityVerification(deps: Dependencies, application: Application): Promise<void> {
  if (application.status !== "awaiting_identity_verification") return
  const verification = application.identityVerification
  if (!verification) throw new Error(`Application ${application.reference} waits for a verification it never started`)

  const result = await deps.identity.getResult(verification.id)
  if (result.status === "failed") return endWithout(deps, application, { kind: "identityFailed" })
  if (result.status === "verified") return accept(deps, application, result.person)
  return waitForCustomer(deps, application, verification)
}

function ownerOn(request: ServiceRequest): Owner {
  if (request.service === "newRegistration") return request.owner
  throw new Error(`An order for ${request.service} has no owner to verify`)
}

// Mail, then a version-checked save: an order a racing tick just cancelled is never filed.
async function accept(deps: Dependencies, application: Application, person: VerifiedPerson): Promise<void> {
  // Provisional: launch plan Q47 (someone else verified: 5b, the customer corrects name and birth date).
  if (!isTheOwner(person, ownerOn(application.request))) return endWithout(deps, application, { kind: "identityMismatch" })

  const now = deps.clock.now()
  // Due at once: if the filing below dies, the next tick resumes it from status 3.
  const verified: Application = { ...applyEvent(application, "identityVerified", now), polling: { attempts: 0, nextPollAt: now } }
  await mailCustomer(deps, verified, "identityVerified")
  await submitToKba(deps, await deps.repository.update(verified))
}

function endWithout(deps: Dependencies, application: Application, failure: Failure): Promise<void> {
  return handleFailure(deps, application, failure, async () => {
    throw new Error("An identity verification is never retried")
  })
}

async function waitForCustomer(deps: Dependencies, application: Application, verification: NonNullable<Application["identityVerification"]>): Promise<void> {
  const now = deps.clock.now()
  const waiting = { startedAt: verificationStartedAt(application.history)!, deadline: verification.deadline, reminderSent: verification.reminderSent }
  const due = verificationDue(waiting, now)
  // Deadline before the hold check, so a lapsing hold is never captured for a cancelled order.
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

async function remind(deps: Dependencies, application: Application): Promise<void> {
  const { link } = await deps.identity.start({ reference: application.reference, email: application.email })
  await mailVerificationLink(deps, application, "identityVerificationReminder", link)
}

// Provisional: launch plan Q48. The claim does not stop a callback that reads `verified` just after it.
async function expire(deps: Dependencies, application: Application): Promise<void> {
  const claimed = await deps.repository.update(application)
  try {
    const settled = await settlePayment(deps, claimed, { type: "verificationExpired" })
    // No nextPollAt: a cancelled order is never looked at again.
    const cancelled: Application = { ...applyEvent(claimed, "identityVerificationExpired", deps.clock.now()), polling: { attempts: claimed.polling.attempts } }
    if (settled.returned.cents > 0) await mailRefund(deps, cancelled, settled.returned)
    await deps.repository.update(cancelled)
  } catch (error) {
    // The claim bumped the version, so the poller's own backoff write would be stale: back off here.
    await deps.repository.update(afterFailure(deps, claimed)).catch(() => undefined)
    throw error
  }
}
