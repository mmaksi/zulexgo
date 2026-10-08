import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { ApplicationStatus } from "@/src/core/domain/application/application-status"
import { Money } from "@/src/core/domain/payment/money"
import { PROCESSING_FEE } from "@/src/core/domain/payment/pricing"
import type { PaymentStatus } from "@/src/core/ports/payment/payment-provider"
import { SEEDED_APPLICATIONS } from "./applications"

export interface SeededPayment {
  readonly id: string
  readonly reference: ApplicationReference
  readonly amount: Money
  readonly status: PaymentStatus
  readonly captured: Money
  readonly refunded: Money
}

const NOTHING = Money.ofCents(0)

/**
 * Where each seeded order's money stands, as the real flow would have left it:
 * a card is held while the order waits for the customer to verify their identity,
 * is with the KBA or waits for a correction, captured on completion, and on a cancel or a final failure captured with all
 * but the fee sent back. Only the fake payment provider reads these, so dev's
 * seeded status pages can show refund amounts and the cancel button works; on
 * staging the payment provider is Stripe, which has never heard of them.
 */
function stand(status: ApplicationStatus, total: Money): Pick<SeededPayment, "status" | "captured" | "refunded"> {
  switch (status) {
    case "awaiting_payment":
      return { status: "awaitingCustomer", captured: NOTHING, refunded: NOTHING }
    case "submitted_and_paid":
    case "awaiting_identity_verification":
    case "identity_verified":
    case "submitted_to_kba":
    case "failed_correctable":
      return { status: "held", captured: NOTHING, refunded: NOTHING }
    case "completed":
      return { status: "captured", captured: total, refunded: NOTHING }
    case "failed_final":
    case "cancelled":
      return { status: "captured", captured: total, refunded: total.subtract(PROCESSING_FEE) }
  }
}

export const SEEDED_PAYMENTS: readonly SeededPayment[] = SEEDED_APPLICATIONS.map(({ application: { reference, status, payment } }) => ({
  id: payment.id,
  reference,
  amount: payment.total,
  ...stand(status, payment.total),
}))
