import { Money } from "./money"
import { PROCESSING_FEE } from "./pricing"

/**
 * How an order ended, as far as its money goes (business logic §3). `completed` is 5a;
 * `cancelled` is the customer giving up at 5b; `failedFinal` is 5c; `ourTechnicalError` is a
 * fault of ours, so everything goes back; `corrected` is a 5b the customer fixed, and
 * `newTotal` is what the corrected order costs.
 */
export type PaymentOutcome =
  | { type: "completed" }
  | { type: "cancelled" }
  | { type: "failedFinal" }
  | { type: "ourTechnicalError" }
  | { type: "corrected"; newTotal: Money }

/**
 * A card is held until captured; SEPA Direct Debit is captured at checkout. `total` is what the
 * order was charged.
 */
export interface PaymentState {
  state: "held" | "captured"
  total: Money
}

/**
 * What to do with the payment at the provider. `capture`: take `amount` from a hold, which
 * releases the rest of it. `release`: let the whole hold go. `refund`: return `amount` of
 * captured money. `chargeAdditional`: collect `amount` more, for a corrected order that costs
 * more. `none`: leave the payment as it is.
 */
export type PaymentAction =
  | { kind: "capture"; amount: Money }
  | { kind: "release" }
  | { kind: "refund"; amount: Money }
  | { kind: "chargeAdditional"; amount: Money }
  | { kind: "none" }

/**
 * What `refundPolicy` decides. `retained` is what the customer ends up paying; `returned` is
 * the rest of the total, whether it comes back by refund or is never taken from a released hold.
 */
export interface PaymentDecision {
  action: PaymentAction
  retained: Money
  returned: Money
}

const NOTHING = Money.ofCents(0)

/** What the provider shows of a payment, for telling whether an outcome was already carried out. */
export interface PaymentRecord {
  status: "awaitingCustomer" | "held" | "captured" | "released"
  total: Money
  captured: Money
  refunded: Money
}

/** What the provider still holds of a payment after refunds: never below zero, whatever a provider calls its reversals. */
export const retainedOf = ({ captured, refunded }: Pick<PaymentRecord, "captured" | "refunded">): Money =>
  refunded.isGreaterThan(captured) ? NOTHING : captured.subtract(refunded)

/**
 * Nothing of the payment has gone back yet: still held, or captured in full and not refunded.
 * Filing an order and correcting one both need this: an order that got part of its money back
 * must not be filed, or return to the KBA.
 */
export const isWhole = (payment: PaymentRecord): boolean =>
  payment.status === "held" || (payment.status === "captured" && retainedOf(payment).equals(payment.total))

/**
 * The decision an earlier run of the same outcome already carried out, read
 * off the payment, so that a rerun (the email after it failed and the whole
 * step was retried) neither refunds twice nor mistakes a released hold for an
 * expired one. Undefined while the money has not reached the outcome's end.
 *
 * Apart from a lapsed hold, which settles every outcome but `corrected`, only `cancelled`,
 * `failedFinal` and `ourTechnicalError` can be found settled: `refundPolicy` itself leaves a
 * completed order's captured payment alone, and a correction has no end state to find.
 */
export function settledDecision(outcome: PaymentOutcome, payment: PaymentRecord): PaymentDecision | undefined {
  const kept = retainedOf(payment)
  const none: PaymentAction = { kind: "none" }

  // A hold that lapsed (Q20) has already gone back whole: there is nothing left to take or return, whatever the outcome.
  if (payment.status === "released" && outcome.type !== "corrected") return decide(none, payment.total, NOTHING)

  switch (outcome.type) {
    case "cancelled":
    case "failedFinal":
      // The fee or less kept: a hold captured down to it (Q8), a payment refunded down to it, or an earlier
      // refund that already went beyond it. The last is reported as it stands; no money is taken back.
      return payment.status === "captured" && !kept.isGreaterThan(PROCESSING_FEE) ? decide(none, payment.total, kept) : undefined
    case "ourTechnicalError":
      // Everything gone back: a hold released, or a captured payment refunded in full.
      return payment.status === "released" || (payment.status === "captured" && kept.equals(NOTHING))
        ? decide(none, payment.total, NOTHING)
        : undefined
    default:
      return undefined
  }
}

/**
 * Business logic §3 as a pure function: what to do with the payment and what
 * the customer ends up paying. Resubmitting after a cancellation is a new order
 * with its own payment, so it has no row here.
 *
 * Per outcome, on a held card and on a captured payment:
 * - `completed`: capture the whole hold; a captured payment is already paid.
 * - `cancelled`, `failedFinal`: keep the processing fee and return the rest (what already went
 *   back counts; an earlier refund beyond the fee is left as it is, never taken back).
 * - `ourTechnicalError`: return everything (release the hold, or refund in full).
 * - `corrected`: charge only what the corrected order costs beyond what was paid; a cheaper
 *   one does not refund the difference.
 *
 * Throws `RangeError` for a total that does not exceed the processing fee: such an order could not
 * keep the fee and return anything, and every price on the list is above it.
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

/**
 * Capturing only the fee on a hold releases the rest: a provisional answer to Q8, pending the
 * founder. A payment already captured gets everything but the fee refunded.
 */
function retainFee({ state, total }: PaymentState): PaymentDecision {
  const action: PaymentAction =
    state === "held"
      ? { kind: "capture", amount: PROCESSING_FEE }
      : { kind: "refund", amount: total.subtract(PROCESSING_FEE) }
  return decide(action, total, PROCESSING_FEE)
}

/** Only an increase is charged. A corrected order that costs the same or less changes nothing. */
function chargeDifference(paid: Money, newTotal: Money): PaymentDecision {
  if (!newTotal.isGreaterThan(paid)) return decide({ kind: "none" }, paid, paid)
  return decide({ kind: "chargeAdditional", amount: newTotal.subtract(paid) }, paid, paid)
}

/** `returned` is whatever of `total` is not `retained`. */
const decide = (action: PaymentAction, total: Money, retained: Money): PaymentDecision => ({
  action,
  retained,
  returned: total.subtract(retained),
})
