import type { Application } from "@/src/core/domain/application"
import { refundPolicy, retainedOf, settledDecision, type PaymentDecision, type PaymentOutcome } from "@/src/core/domain/refund-policy"
import { HoldExpired } from "@/src/core/errors/hold-expired"
import type { Dependencies } from "./dependencies"

/**
 * Carries out the refund policy's decision on the provider. Safe to rerun:
 * an outcome the payment already shows is reported, not repeated, so a step
 * retried after a failed email finds its money already settled.
 *
 * Called with the order's outcome before its status and emails are written: 5a (a card
 * still held is captured in full), a cancel or 5c (the processing fee is kept, the rest
 * goes back), or our own failure (everything goes back). Returns what was kept and what
 * went back, which is what the customer's emails state. Throws `HoldExpired` if the payment
 * is neither held nor captured, which leaves nothing to settle.
 *
 * The answer to a capture is checked: if more than the fee was taken since our read (hold
 * protection takes a whole hold), the payment is settled again as a captured one, so the
 * customer is only told about a return that was actually made. A refund is the balance still
 * retained minus what the outcome keeps, not the policy's own amount, so money that already
 * went back (an earlier refund) is never returned twice.
 */
export async function settlePayment(
  deps: Pick<Dependencies, "payments">,
  application: Application,
  outcome: PaymentOutcome,
): Promise<PaymentDecision> {
  const { id, total } = application.payment
  const payment = await deps.payments.getPayment(id)
  // The money already shows this outcome (a rerun after a later step failed): report it only.
  const settled = settledDecision(outcome, { ...payment, total })
  if (settled) {
    // A released hold is the expected end of our own failure. For any other outcome it lapsed
    // before we took it (launch plan Q20): the order ends as the KBA decided with nothing kept.
    if (payment.status === "released" && outcome.type !== "ourTechnicalError") {
      console.warn(`[payments] ${application.reference}: the hold lapsed before it was taken; the order ends as ${outcome.type} with nothing kept`)
    }
    return settled
  }
  if (payment.status !== "held" && payment.status !== "captured") throw new HoldExpired(id)

  const decision = refundPolicy(outcome, { state: payment.status, total })
  const { action } = decision
  if (action.kind === "capture") {
    const captured = await deps.payments.capture(id, action.amount)
    // Hold protection may have captured the full amount since our read. Settle
    // that actual capture before announcing a return to the customer.
    if (retainedOf(captured).isGreaterThan(decision.retained)) return settlePayment(deps, application, outcome)
  }
  if (action.kind === "release") await deps.payments.release(id)
  if (action.kind === "refund") {
    // Refund only what is still owed: an earlier manual refund or partial
    // capture must not make us return the original total a second time.
    const amount = retainedOf(payment).subtract(decision.retained)
    // One key per order: the provider refunds once however often this is sent, whatever the amount of a rerun.
    await deps.payments.refund(id, amount, `${application.reference}-refund`)
    return { ...decision, action: { kind: "refund", amount } }
  }
  // Launch plan Q11, a provisional answer: a correction never costs more.
  if (action.kind === "chargeAdditional") throw new Error("A de-registration correction never costs more")
  return decision
}
