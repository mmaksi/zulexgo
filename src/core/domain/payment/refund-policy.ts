import { Money } from "./money"
import { PROCESSING_FEE } from "./pricing"

// Provisional: launch plan Q48 (verificationExpired gets everything back)
export type PaymentOutcome =
  | { type: "completed" }
  | { type: "cancelled" }
  | { type: "failedFinal" }
  | { type: "ourTechnicalError" }
  | { type: "verificationExpired" }

export interface PaymentState {
  state: "held" | "captured"
  total: Money
}

export type PaymentAction =
  | { kind: "capture"; amount: Money }
  | { kind: "release" }
  | { kind: "refund"; amount: Money }
  | { kind: "none" }

export interface PaymentDecision {
  action: PaymentAction
  retained: Money
  returned: Money
}

const NOTHING = Money.ofCents(0)

export interface PaymentRecord {
  status: "awaitingCustomer" | "held" | "captured" | "released"
  total: Money
  captured: Money
  refunded: Money
}

export const retainedOf = ({ captured, refunded }: Pick<PaymentRecord, "captured" | "refunded">): Money =>
  refunded.isGreaterThan(captured) ? NOTHING : captured.subtract(refunded)

export const isWhole = (payment: PaymentRecord): boolean =>
  payment.status === "held" || (payment.status === "captured" && retainedOf(payment).equals(payment.total))

export function settledDecision(outcome: PaymentOutcome, payment: PaymentRecord): PaymentDecision | undefined {
  const kept = retainedOf(payment)
  const none: PaymentAction = { kind: "none" }

  if (payment.status === "released") return decide(none, payment.total, NOTHING)

  switch (outcome.type) {
    case "cancelled":
    case "failedFinal":
      return payment.status === "captured" && !kept.isGreaterThan(PROCESSING_FEE) ? decide(none, payment.total, kept) : undefined
    case "ourTechnicalError":
    case "verificationExpired":
      return payment.status === "captured" && kept.equals(NOTHING) ? decide(none, payment.total, NOTHING) : undefined
    default:
      return undefined
  }
}

export function refundPolicy(outcome: PaymentOutcome, payment: PaymentState): PaymentDecision {
  const { total, state } = payment
  if (!total.isGreaterThan(PROCESSING_FEE)) throw new RangeError("An order total must exceed the processing fee")

  switch (outcome.type) {
    case "completed":
      return decide(state === "held" ? { kind: "capture", amount: total } : { kind: "none" }, total, total)
    case "cancelled":
    case "failedFinal":
      return retainFee(payment)
    case "ourTechnicalError":
    case "verificationExpired":
      return decide(state === "held" ? { kind: "release" } : { kind: "refund", amount: total }, total, NOTHING)
  }
}

// Provisional: launch plan Q8: capturing only the fee releases the rest of the hold.
function retainFee({ state, total }: PaymentState): PaymentDecision {
  const action: PaymentAction =
    state === "held"
      ? { kind: "capture", amount: PROCESSING_FEE }
      : { kind: "refund", amount: total.subtract(PROCESSING_FEE) }
  return decide(action, total, PROCESSING_FEE)
}

const decide = (action: PaymentAction, total: Money, retained: Money): PaymentDecision => ({
  action,
  retained,
  returned: total.subtract(retained),
})
