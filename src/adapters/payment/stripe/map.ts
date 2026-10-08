import type Stripe from "stripe"
import { applicationReferenceSchema } from "@/src/core/domain/application/application-reference"
import { Money } from "@/src/core/domain/payment/money"
import type { Payment, PaymentNotification, PaymentStatus } from "@/src/core/ports/payment/payment-provider"

const STATUSES: Partial<Record<Stripe.PaymentIntent.Status, PaymentStatus>> = {
  requires_capture: "held",
  succeeded: "captured",
  canceled: "released",
}

/**
 * The events that say a payment is ready. Under manual capture a held card fires
 * `payment_intent.amount_capturable_updated` (the payment method is verified and the money is on hold);
 * `payment_intent.succeeded` covers what cannot be held (the money has been charged).
 */
const READY_EVENTS = new Set(["payment_intent.amount_capturable_updated", "payment_intent.succeeded"])

/** Stripe's PaymentIntent, with `latest_charge` expanded, in our terms. */
export function toPayment(intent: Stripe.PaymentIntent): Payment {
  // A state we do not model (still needing a payment method or an action) reads as not yet paid.
  const status = STATUSES[intent.status] ?? "awaitingCustomer"
  // The charge behind the intent, which carries the card's capture deadline and the amount refunded; none until the customer pays.
  const charge = typeof intent.latest_charge === "object" ? intent.latest_charge : null
  // When Stripe lets the hold go if it is not captured, in seconds since the epoch.
  const captureBefore = charge?.payment_method_details?.card?.capture_before
  // Cents Stripe has actually taken: only a succeeded intent has any, and a partial capture counts only its part.
  const captured = status === "captured" ? intent.amount_received : 0

  return {
    id: intent.id,
    status,
    amount: Money.ofCents(intent.amount),
    captured: Money.ofCents(captured),
    // Stripe shows a cancelled authorisation as a charge fully refunded; nothing was taken, so nothing was returned.
    refunded: Money.ofCents(Math.min(charge?.amount_refunded ?? 0, captured)),
    holdExpiresAt: status === "held" && captureBefore ? new Date(captureBefore * 1000) : undefined,
    registrationId: intent.metadata?.application_id,
  }
}

export function toNotification(event: Stripe.Event): PaymentNotification {
  if (!READY_EVENTS.has(event.type)) return { kind: "ignored", eventId: event.id }

  // A PaymentIntent created elsewhere on the account is not an order of ours, and neither is one whose `order_id` is not
  // one of our references. Such a signed event is ignored, not an error, so that Stripe is not made to redeliver it.
  const orderId = (event.data.object as Stripe.PaymentIntent).metadata?.order_id
  const reference = applicationReferenceSchema.safeParse(orderId)
  if (!reference.success) return { kind: "ignored", eventId: event.id }
  return { kind: "paymentReady", eventId: event.id, reference: reference.data }
}
