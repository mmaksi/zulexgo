import { applyEvent, filingDueSince, type Application } from "@/src/core/domain/application/application"
import { requiresIdentityVerification } from "@/src/core/domain/application/application-status"
import { nextVerificationCheckAt, verificationDeadlineAt } from "@/src/core/domain/payment/verification-policy"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailVerificationLink } from "@/src/core/use-cases/mail/mail-customer"
import { handleFailure } from "@/src/core/use-cases/registration/handle-failure"
import { afterFailure } from "@/src/core/use-cases/registration/submit-to-kba"

/**
 * A paid order of a service that verifies the customer's identity (Neuzulassung, launch plan Q45, provisional)
 * does not go to the KBA: it opens the verification and waits for the customer (status 2), instead of being
 * filed. Called by `confirmPayment` as soon as the payment is recorded, and by the poller for an order still
 * at status 1 (a start that died, or one waiting out an outage). Anything else is left alone, so a repeat is harmless.
 *
 * The provider is asked first and the customer second: `start` returns the same verification for an order
 * already started, so a retry never sends a second link. Email 2 goes out before the status is saved, so a failed
 * send leaves the order at status 1 for the poller to redo, with the one link it already has. The deadline is
 * stored, so the one in that email is the one enforced. It counts from the payment, not from this attempt: a retry
 * (a failed send, a lost write, two ticks at once) must rebuild email 2 word for word, since a mailer holds an
 * idempotency key only with the content it first saw (Resend refuses the same key with other content, for a day).
 *
 * A provider that cannot be reached is an outage on our side, like a registration service that cannot be reached:
 * the start is retried silently, and after a day the order fails with everything refunded (`handleFailure`).
 */
export async function startIdentityVerification(deps: Dependencies, application: Application): Promise<void> {
  if (application.status !== "submitted_and_paid" || !requiresIdentityVerification(application.request.service)) return

  let started: { verificationId: string; link: string }
  try {
    started = await deps.identity.start({ reference: application.reference, email: application.email })
  } catch (error) {
    // By order and kind of error only: the message could hold the customer's address.
    console.error(`[identity] ${application.reference}: verification not started: ${error instanceof Error ? error.name : "unknown error"}`)
    await handleFailure(deps, application, { kind: "unavailable" }, async (retrying) => afterFailure(deps, retrying))
    return
  }

  const now = deps.clock.now()
  const deadline = verificationDeadlineAt(filingDueSince(application.history) ?? now)
  const waiting: Application = {
    ...applyEvent(application, "identityVerificationStarted", now),
    identityVerification: { id: started.verificationId, deadline, reminderSent: false },
    polling: { attempts: 0, nextPollAt: nextVerificationCheckAt({ startedAt: now, deadline, reminderSent: false, attempts: 0, now }) },
  }
  await mailVerificationLink(deps, waiting, "identityVerificationRequested", started.link)
  await deps.repository.update(waiting)
}
