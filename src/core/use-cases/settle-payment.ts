import type { Application } from "@/src/core/domain/application"
import { refundPolicy, retainedOf, settledDecision, type PaymentDecision, type PaymentOutcome } from "@/src/core/domain/refund-policy"
import { HoldExpired } from "@/src/core/errors/hold-expired"
import type { Dependencies } from "./dependencies"

/**
 * Carries out the refund policy's decision on the provider. Safe to rerun:
 * an outcome the payment already shows is reported, not repeated, so a step
 * retried after a failed email finds its money already settled.
 */
export async function settlePayment(
  deps: Pick<Dependencies, "payments">,
  application: Application,
  outcome: PaymentOutcome,
): Promise<PaymentDecision> {
  const { id, total } = application.payment
  const payment = await deps.payments.getPayment(id)
  const settled = settledDecision(outcome, { ...payment, total })
  if (settled) {
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
    await deps.payments.refund(id, amount, `${application.reference}-refund`)
    return { ...decision, action: { kind: "refund", amount } }
  }
  if (action.kind === "chargeAdditional") throw new Error("A de-registration correction never costs more")
  return decision
}
