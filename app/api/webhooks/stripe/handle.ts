import { NotificationRejected } from "@/src/core/errors/mail/notification-rejected"
import type { Dependencies } from "@/src/core/use-cases/dependencies"
import { confirmPayment } from "@/src/core/use-cases/payment/confirm-payment"

/**
 * Stripe's webhook: verify, then act. A rejected signature is a 400, which
 * Stripe does not retry; any other failure is a 500, which it does. Acting
 * twice on one event is harmless: only an application awaiting payment moves.
 */
export async function handlePaymentNotification(deps: Dependencies, request: Request): Promise<Response> {
  let notification
  try {
    notification = deps.payments.readNotification(await request.text(), request.headers.get("stripe-signature"))
  } catch (error) {
    if (error instanceof NotificationRejected) return new Response(null, { status: 400 })
    throw error
  }

  if (notification.kind === "paymentReady") await confirmPayment(deps, notification.reference)
  return new Response(null, { status: 200 })
}
