import type { Application } from "@/src/core/domain/application"
import { refundPolicy, type PaymentDecision, type PaymentOutcome } from "@/src/core/domain/refund-policy"
import { HoldExpired } from "@/src/core/errors/hold-expired"
import type { Dependencies } from "./dependencies"

/** Carries out the refund policy's decision on the provider. Refunds are keyed by application, so a rerun refunds once. */
export async function settlePayment(
  deps: Pick<Dependencies, "payments">,
  application: Application,
  outcome: PaymentOutcome,
): Promise<PaymentDecision> {
  const { id, total } = application.payment
  const payment = await deps.payments.getPayment(id)
  if (payment.status !== "held" && payment.status !== "captured") throw new HoldExpired(id)

  const decision = refundPolicy(outcome, { state: payment.status, total })
  const { action } = decision
  if (action.kind === "capture") await deps.payments.capture(id, action.amount)
  if (action.kind === "release") await deps.payments.release(id)
  if (action.kind === "refund") await deps.payments.refund(id, action.amount, `${application.reference}-refund`)
  if (action.kind === "chargeAdditional") throw new Error("A de-registration correction never costs more")
  return decision
}
