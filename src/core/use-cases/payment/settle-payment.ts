import type { Application } from "@/src/core/domain/application/application"
import { refundPolicy, retainedOf, settledDecision, type PaymentDecision, type PaymentOutcome } from "@/src/core/domain/payment/refund-policy"
import { HoldExpired } from "@/src/core/errors/payment/hold-expired"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

export async function settlePayment(
  deps: Pick<Dependencies, "payments">,
  application: Application,
  outcome: PaymentOutcome,
): Promise<PaymentDecision> {
  const { id, total } = application.payment
  const payment = await deps.payments.getPayment(id)
  const settled = settledDecision(outcome, { ...payment, total })
  if (settled) {
    // Launch plan Q20: a hold that lapsed before we took it ends the order as decided, nothing kept.
    if (payment.status === "released" && outcome.type !== "ourTechnicalError" && outcome.type !== "verificationExpired") {
      console.warn(`[payments] ${application.reference}: the hold lapsed before it was taken; the order ends as ${outcome.type} with nothing kept`)
    }
    return settled
  }
  if (payment.status !== "held" && payment.status !== "captured") throw new HoldExpired(id)

  const decision = refundPolicy(outcome, { state: payment.status, total })
  const { action } = decision
  if (action.kind === "capture") {
    const captured = await deps.payments.capture(id, action.amount)
    // Hold protection may have taken the whole hold since our read: settle that capture instead.
    if (retainedOf(captured).isGreaterThan(decision.retained)) return settlePayment(deps, application, outcome)
  }
  if (action.kind === "release") await deps.payments.release(id)
  if (action.kind === "refund") {
    // Only what is still owed: an earlier refund or partial capture must not be returned twice.
    const amount = retainedOf(payment).subtract(decision.retained)
    // One key per order, not per amount: a rerun with another amount must not refund twice.
    await deps.payments.refund(id, amount, `${application.reference}-refund`)
    return { ...decision, action: { kind: "refund", amount } }
  }
  return decision
}
