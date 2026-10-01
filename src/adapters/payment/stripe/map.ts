import type Stripe from "stripe"
import { parseApplicationReference } from "@/src/core/domain/application-reference"
import { Money } from "@/src/core/domain/money"
import type { Payment, PaymentNotification, PaymentStatus } from "@/src/core/ports/payment-provider"

const STATUSES: Partial<Record<Stripe.PaymentIntent.Status, PaymentStatus>> = {
  requires_capture: "held",
  succeeded: "captured",
  canceled: "released",
}

/** Under manual capture a held card fires `amount_capturable_updated`; `succeeded` covers what cannot be held. */
const READY_EVENTS = new Set(["payment_intent.amount_capturable_updated", "payment_intent.succeeded"])

/** Stripe's PaymentIntent, with `latest_charge` expanded, in our terms. */
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
    // Stripe shows a cancelled authorisation as a charge fully refunded; nothing was taken, so nothing was returned.
    refunded: Money.ofCents(Math.min(charge?.amount_refunded ?? 0, captured)),
    holdExpiresAt: status === "held" && captureBefore ? new Date(captureBefore * 1000) : undefined,
    registrationId: intent.metadata?.application_id,
  }
}

export function toNotification(event: Stripe.Event): PaymentNotification {
  if (!READY_EVENTS.has(event.type)) return { kind: "ignored", eventId: event.id }

  // A PaymentIntent created elsewhere on the account is not an order of ours.
  const orderId = (event.data.object as Stripe.PaymentIntent).metadata?.order_id
  if (!orderId) return { kind: "ignored", eventId: event.id }
  return { kind: "paymentReady", eventId: event.id, reference: parseApplicationReference(orderId) }
}
