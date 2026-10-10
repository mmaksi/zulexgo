import { applyEvent, filingDueSince, type Application } from "@/src/core/domain/application/application"
import { requiresIdentityVerification } from "@/src/core/domain/application/application-status"
import { nextVerificationCheckAt, verificationDeadlineAt } from "@/src/core/domain/payment/verification-policy"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { mailVerificationLink } from "@/src/core/use-cases/mail/mail-customer"
import { handleFailure } from "@/src/core/use-cases/registration/handle-failure"
import { afterFailure } from "@/src/core/use-cases/registration/submit-to-kba"

// Provisional: launch plan Q45 (a Neuzulassung verifies identity before it is filed).
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
  // From the payment, not now: a retry must rebuild email 2 exactly (Resend binds a key to its content).
  const deadline = verificationDeadlineAt(filingDueSince(application.history) ?? now)
  const waiting: Application = {
    ...applyEvent(application, "identityVerificationStarted", now),
    identityVerification: { id: started.verificationId, deadline, reminderSent: false },
    polling: { attempts: 0, nextPollAt: nextVerificationCheckAt({ startedAt: now, deadline, reminderSent: false, attempts: 0, now }) },
  }
  // Mail before saving: a failed send leaves the order at status 1 for the poller to redo.
  await mailVerificationLink(deps, waiting, "identityVerificationRequested", started.link)
  await deps.repository.update(waiting)
}
