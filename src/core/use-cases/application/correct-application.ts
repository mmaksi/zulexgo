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

// Launch plan Q11: a correction never costs more. Q47: an unverified Neuzulassung is rechecked, not filed.
export async function correctApplication(deps: Dependencies, token: string, input: OrderCorrectionInput): Promise<"resubmitted" | "refused"> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()

  const filed = application.zulexApplicationId !== undefined
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
  if (!payment.amount.equals(application.payment.total) || !isWhole({ ...payment, total: application.payment.total })) throw new PaymentNoLongerWhole()

  const { applied, send } = corrector(deps, application, input, identityVerified)
  const withCorrection = (order: Application): Application => ({ ...order, request: applied(), failure: undefined, retryAttempts: 0 })

  if (event === "correctionRechecked") return recheck(deps, withCorrection(application))
  if (!filed) return refile(deps, withCorrection(application))
  // Claimed before sending: the service cannot be told to forget a patch.
  const claimed = await deps.repository.update(application)
  return patch(deps, withCorrection(claimed), send)
}

// Literal service names let the compiler check that each gets its own correction type.
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

async function patch(deps: Dependencies, application: Application, send: () => Promise<void>): Promise<"resubmitted" | "refused"> {
  try {
    // A rerun finds the service already working on it: patching again would reach the KBA twice.
    if ((await deps.registration.getStatus(application.request.service, application.zulexApplicationId!)).state !== "inProgress") await send()
  } catch (error) {
    if (error instanceof GatewayRejected) return "refused"
    throw error
  }

  const now = deps.clock.now()
  const resubmitted = {
    ...applyEvent(application, "correctionResubmitted", now),
    polling: { attempts: 0, nextPollAt: nextPollAt({ ikfzStatus: application.ikfzStatus, attempts: 0, now }) },
  }
  // Status first, unlike other emails: an order left at 5b would never be polled again.
  await deps.repository.update(resubmitted)
  await mailCustomer(deps, resubmitted, "submittedToKba").catch((error) => {
    console.error(`[correction] ${resubmitted.reference}: the email that the order is back at the KBA was not sent: ${error instanceof Error ? error.name : "unknown error"}`)
  })
  return "resubmitted"
}

// A fresh idempotency key: the old one is tied to the refused request (launch plan Q37).
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

async function recheck(deps: Dependencies, application: Application): Promise<"resubmitted" | "refused"> {
  const now = deps.clock.now()
  const rechecking = await deps.repository.update({
    ...applyEvent(application, "correctionRechecked", now),
    polling: { attempts: 0, nextPollAt: now },
  })

  // Whatever goes wrong in the read, the poller repeats it: the correction itself is done.
  await checkIdentityVerification(deps, rechecking).catch((error) => {
    console.error(`[correction] ${rechecking.reference}: the identity check will be repeated: ${error instanceof Error ? error.name : "unknown error"}`)
  })
  const after = await deps.repository.get(rechecking.reference)
  return after?.status === "failed_correctable" && after.failure?.kind === "identityMismatch" ? "refused" : "resubmitted"
}
