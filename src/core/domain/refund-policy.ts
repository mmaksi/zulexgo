import { Money } from "./money"
import { PROCESSING_FEE } from "./pricing"

export type PaymentOutcome =
  | { type: "completed" }
  | { type: "cancelled" }
  | { type: "failedFinal" }
  | { type: "ourTechnicalError" }
  | { type: "corrected"; newTotal: Money }

/** A card is held until captured; SEPA Direct Debit is captured at checkout. */
export interface PaymentState {
  state: "held" | "captured"
  total: Money
}

export type PaymentAction =
  | { kind: "capture"; amount: Money }
  | { kind: "release" }
  | { kind: "refund"; amount: Money }
  | { kind: "chargeAdditional"; amount: Money }
  | { kind: "none" }

export interface PaymentDecision {
  action: PaymentAction
  retained: Money
  returned: Money
}

const NOTHING = Money.ofCents(0)

/**
 * Business logic §3 as a pure function: what to do with the payment and what
 * the customer ends up paying. Resubmitting after a cancellation is a new order
 * with its own payment, so it has no row here.
 */
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
      return decide(state === "held" ? { kind: "release" } : { kind: "refund", amount: total }, total, NOTHING)
    case "corrected":
      return chargeDifference(total, outcome.newTotal)
  }
}

/** Capturing only the fee on a hold releases the rest: a provisional answer to Q8, pending the founder. */
function retainFee({ state, total }: PaymentState): PaymentDecision {
  const action: PaymentAction =
    state === "held"
      ? { kind: "capture", amount: PROCESSING_FEE }
      : { kind: "refund", amount: total.subtract(PROCESSING_FEE) }
  return decide(action, total, PROCESSING_FEE)
}

function chargeDifference(paid: Money, newTotal: Money): PaymentDecision {
  if (!newTotal.isGreaterThan(paid)) return decide({ kind: "none" }, paid, paid)
  return decide({ kind: "chargeAdditional", amount: newTotal.subtract(paid) }, paid, paid)
}

const decide = (action: PaymentAction, total: Money, retained: Money): PaymentDecision => ({
  action,
  retained,
  returned: total.subtract(retained),
})
