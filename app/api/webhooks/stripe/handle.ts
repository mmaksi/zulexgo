import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"

// 400 only for a bad signature: Stripe does not retry it, and retries any 500
export async function handlePaymentNotification(deps: Dependencies, request: Request): Promise<Response> {
  let notification
  try {
    notification = deps.payments.readNotification(await request.text(), request.headers.get("stripe-signature"))
  } catch (error) {
    if (error instanceof NotificationRejected) return new Response(null, { status: 400 })
    throw error
  }

  if (notification.kind === "paymentReady") {
    try {
      await confirmPayment(deps, notification.reference)
    } catch (error) {
      // Order and error name only: a database error can quote the customer's row
      console.error(`[payments] ${notification.reference}: notification not handled: ${error instanceof Error ? error.name : "unknown error"}`)
      return new Response(null, { status: 500 })
    }
  }
  return new Response(null, { status: 200 })
}
