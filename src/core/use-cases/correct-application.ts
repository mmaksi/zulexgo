import { applyEvent, type Application } from "@/src/core/domain/application"
import { applyCorrection, parseCorrection, type CorrectionInput } from "@/src/core/domain/correction"
import { nextPollAt } from "@/src/core/domain/poll-schedule"
import { GatewayRejected } from "@/src/core/errors/gateway-rejected"
import { TokenInvalid } from "@/src/core/errors/token-invalid"
import type { Correction } from "@/src/core/ports/registration-gateway"
import type { Dependencies } from "./dependencies"
import { mailCustomer } from "./mail-customer"
import { submitToKba } from "./submit-to-kba"

/**
 * 5b, option A: the customer corrects and the order goes back to the KBA. Only
 * an order waiting for a correction can be corrected, and nothing changes
 * until the service has taken the new data: `refused` means it did not, and the
 * order is left as it was. Launch plan Q11: a correction never costs more.
 *
 * An order the service holds is patched and returns to status 4, with email 4
 * again. One it refused outright holds nothing to patch, so the corrected
 * order is filed afresh under a new idempotency key (the service's 400 says
 * "resubmit a new request").
 */
export async function correctApplication(deps: Dependencies, token: string, input: CorrectionInput): Promise<"resubmitted" | "refused"> {
  const application = token ? await deps.repository.findByStatusToken(token) : undefined
  if (!application) throw new TokenInvalid()

  const filed = application.zulexApplicationId !== undefined
  // Refuses an order that is not at 5b before anything is read or sent.
  applyEvent(application, filed ? "correctionResubmitted" : "correctionRefiled", deps.clock.now())
  const correction = parseCorrection(input, application.request.plateCount)
  const corrected: Application = { ...application, request: applyCorrection(application.request, correction), failure: undefined, retryAttempts: 0 }

  return filed ? patch(deps, corrected, application.zulexApplicationId!, correction) : refile(deps, corrected)
}

async function patch(deps: Dependencies, application: Application, zulexId: string, correction: Correction): Promise<"resubmitted" | "refused"> {
  try {
    // A rerun after the first attempt got this far finds the service already working on it: patching again would send it twice.
    if ((await deps.registration.getStatus(zulexId)).state !== "inProgress") await deps.registration.correct(zulexId, correction)
  } catch (error) {
    if (error instanceof GatewayRejected) return "refused"
    throw error
  }

  const now = deps.clock.now()
  const resubmitted = {
    ...applyEvent(application, "correctionResubmitted", now),
    polling: { attempts: 0, nextPollAt: nextPollAt({ ikfzStatus: application.ikfzStatus, attempts: 0, now }) },
  }
  // The email goes out before the status, as everywhere: a failed send leaves the order at 5b to ask again.
  await mailCustomer(deps, resubmitted, "submittedToKba")
  await deps.repository.update(resubmitted)
  return "resubmitted"
}

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
