import type { Application } from "@/src/core/domain/application"
import { shouldCaptureAhead } from "@/src/core/domain/hold-policy"
import { HoldExpired } from "@/src/core/errors/hold-expired"
import type { Payment } from "@/src/core/ports/payment-provider"
import type { Dependencies } from "./dependencies"

/**
 * Takes the whole held amount (launch plan Q7: an online authority's order once
 * Zulex accepts it). Safe to repeat: a payment no longer held is left alone.
 */
export const captureHold = (deps: Pick<Dependencies, "payments" | "clock">, application: Application): Promise<Payment> =>
  secure(deps, application, () => true)

/** Takes the money of a hold that is close to lapsing (launch plan Q20), and leaves any other alone. */
export const guardHold = (deps: Pick<Dependencies, "payments" | "clock">, application: Application): Promise<Payment> =>
  secure(deps, application, (payment) => shouldCaptureAhead(payment, deps.clock.now()))

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
    console.warn(`[payments] ${reference}: the hold lapsed before it could be taken`)
    return payments.getPayment(id)
  }
}
