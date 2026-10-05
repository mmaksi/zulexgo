import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { checkIdentityVerification } from "@/src/core/use-cases/identity/check-identity-verification"

/**
 * The identity provider's callback, for a provider that calls back: verify, then look. A rejected signature
 * is a 400, which a provider does not retry; any other failure is a 500, which it does. Nothing in the
 * callback is believed beyond the order it names: the outcome is read from the provider, exactly as the poller
 * reads it, so a callback adds speed and never authority. Acting twice on one is harmless, and an order nobody
 * holds is answered like any other, so a caller learns nothing about which references exist. A check that fails
 * is a 500, logged by order and kind of error only.
 *
 * The header name is ours until a provider is chosen: its real one, and the scheme behind it, belong in the adapter.
 */
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
      // By order and kind of error only: a provider's message can quote the customer, and the framework would log it whole.
      console.error(`[identity] ${notification.reference}: callback not handled: ${error instanceof Error ? error.name : "unknown error"}`)
      return new Response(null, { status: 500 })
    }
  }
  return new Response(null, { status: 200 })
}
