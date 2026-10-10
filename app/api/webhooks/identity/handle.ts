import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { checkIdentityVerification } from "@/src/core/use-cases/identity/check-identity-verification"

// Trusts only the order a callback names: the outcome is read from the provider, as the poller does
export async function handleIdentityNotification(deps: Dependencies, request: Request): Promise<Response> {
  let notification
  try {
    notification = deps.identity.readNotification(await request.text(), request.headers.get("x-identity-signature"))
  } catch (error) {
    if (error instanceof NotificationRejected) return new Response(null, { status: 400 })
    throw error
  }

  if (notification.kind === "verificationChanged") {
    const application = await deps.repository.get(notification.reference)
    try {
      if (application) await checkIdentityVerification(deps, application)
    } catch (error) {
      // Order and error name only: a provider's message can quote the customer
      console.error(`[identity] ${notification.reference}: callback not handled: ${error instanceof Error ? error.name : "unknown error"}`)
      return new Response(null, { status: 500 })
    }
  }
  return new Response(null, { status: 200 })
}
