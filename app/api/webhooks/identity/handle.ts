import type { Env } from "@/src/config/env"
import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { checkIdentityVerification } from "@/src/core/use-cases/identity/check-identity-verification"

// Trusts only the order a callback names: the outcome is read from the provider, as the poller does
export async function handleIdentityNotification(
  deps: Dependencies & { env: Pick<Env, "APP_ENV" | "IDENTITY_DRIVER"> },
  request: Request,
): Promise<Response> {
  // The fake check's signing secret is in this public repo, and production sells nothing that verifies with it.
  if (deps.env.APP_ENV === "production" && deps.env.IDENTITY_DRIVER === "fake") return new Response(null, { status: 404 })

  let notification
  try {
    notification = deps.identity.readNotification(await request.text(), request.headers.get("x-identity-signature"))
  } catch (error) {
    if (error instanceof NotificationRejected) return new Response(null, { status: 400 })
    throw error
  }

  if (notification.kind === "verificationChanged") {
    try {
      const application = await deps.repository.get(notification.reference)
      if (application) await checkIdentityVerification(deps, application)
    } catch (error) {
      // Order and error name only: a provider's message can quote the customer
      console.error(`[identity] ${notification.reference}: callback not handled: ${error instanceof Error ? error.name : "unknown error"}`)
      return new Response(null, { status: 500 })
    }
  }
  return new Response(null, { status: 200 })
}
