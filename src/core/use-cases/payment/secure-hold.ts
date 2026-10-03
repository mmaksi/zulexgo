import type { Application } from "@/src/core/domain/application/application"
import { shouldCaptureAhead } from "@/src/core/domain/payment/hold-policy"
import { HoldExpired } from "@/src/core/errors/payment/hold-expired"
import type { Payment } from "@/src/core/ports/payment/payment-provider"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

/**
 * Takes the whole held amount (launch plan Q7: an online authority's order once
 * Zulex accepts it). Safe to repeat: a payment no longer held is left alone.
 * Called by `submitToKba` for an online authority, once the service has the application.
 */
export const captureHold = (deps: Pick<Dependencies, "payments" | "clock">, application: Application): Promise<Payment> =>
  secure(deps, application, () => true)

/**
 * Takes the money of a hold that is close to lapsing (launch plan Q20), and leaves any other alone.
 * Called by the poller for a hand-processed order still at the KBA and for a 5b waiting on the
 * customer, whose hold can otherwise run out first.
 */
export const guardHold = (deps: Pick<Dependencies, "payments" | "clock">, application: Application): Promise<Payment> =>
  secure(deps, application, (payment) => shouldCaptureAhead(payment, deps.clock.now()))

/**
 * Reads the payment first and captures only a hold that `mustCapture` says to take; a payment
 * in any other state (a SEPA debit is taken at checkout) is returned as it is.
 */
async function secure(
  { payments }: Pick<Dependencies, "payments">,
  { reference, payment: { id, total } }: Application,
  mustCapture: (payment: Payment) => boolean,
): Promise<Payment> {
  const payment = await payments.getPayment(id)
  if (payment.status !== "held" || !mustCapture(payment)) return payment

  try {
    return await payments.capture(id, total)
  } catch (error) {
    if (!(error instanceof HoldExpired)) throw error
    // The hold ran out between the read and the capture. Not an error: the order goes on
    // and settlement later treats a released hold as nothing to take or return.
    console.warn(`[payments] ${reference}: the hold lapsed before it could be taken`)
    return payments.getPayment(id)
  }
}
