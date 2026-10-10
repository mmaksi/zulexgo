import type Stripe from "stripe"
import { applicationReferenceSchema } from "@/src/core/domain/application/application-reference"
import { Money } from "@/src/core/domain/payment/money"
import type { Payment, PaymentNotification, PaymentStatus } from "@/src/core/ports/payment/payment-provider"

const STATUSES: Partial<Record<Stripe.PaymentIntent.Status, PaymentStatus>> = {
  requires_capture: "held",
  succeeded: "captured",
  canceled: "released",
}

// Manual capture fires amount_capturable_updated once a card is held; succeeded comes only with the capture.
const READY_EVENTS = new Set(["payment_intent.amount_capturable_updated", "payment_intent.succeeded"])

export function toPayment(intent: Stripe.PaymentIntent): Payment {
  const status = STATUSES[intent.status] ?? "awaitingCustomer"
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null
  const captureBefore = charge?.payment_method_details?.card?.capture_before
  const captured = status === "captured" ? intent.amount_received : 0

  return {
    id: intent.id,
    status,
    amount: Money.ofCents(intent.amount),
    captured: Money.ofCents(captured),
    // Stripe shows a cancelled authorisation as fully refunded, though nothing was taken.
    refunded: Money.ofCents(Math.min(charge?.amount_refunded ?? 0, captured)),
    holdExpiresAt: status === "held" && captureBefore ? new Date(captureBefore * 1000) : undefined,
    registrationId: intent.metadata?.application_id,
  }
}

export function toNotification(event: Stripe.Event): PaymentNotification {
  if (!READY_EVENTS.has(event.type)) return { kind: "ignored", eventId: event.id }

  // Not ours (another PaymentIntent on the account): ignore it, as an error makes Stripe redeliver it.
  const orderId = (event.data.object as Stripe.PaymentIntent).metadata?.order_id
  const reference = applicationReferenceSchema.safeParse(orderId)
  if (!reference.success) return { kind: "ignored", eventId: event.id }
  return { kind: "paymentReady", eventId: event.id, reference: reference.data }
}
