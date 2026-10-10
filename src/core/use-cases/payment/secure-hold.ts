import type { Application } from "@/src/core/domain/application/application"
import { shouldCaptureAhead } from "@/src/core/domain/payment/hold-policy"
import { HoldExpired } from "@/src/core/errors/payment/hold-expired"
import type { Payment } from "@/src/core/ports/payment/payment-provider"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

// Launch plan Q7: an online authority's order is captured in full once Zulex accepts it.
export const captureHold = (deps: Pick<Dependencies, "payments" | "clock">, application: Application): Promise<Payment> =>
  secure(deps, application, () => true)

// Launch plan Q20: capture a hold that is close to lapsing.
export const guardHold = (deps: Pick<Dependencies, "payments" | "clock">, application: Application): Promise<Payment> =>
  secure(deps, application, (payment) => shouldCaptureAhead(payment, deps.clock.now()))

// Logged by order and error name only: the message could hold personal data.
export const guardHoldQuietly = (deps: Pick<Dependencies, "payments" | "clock">, application: Application): Promise<void> =>
  guardHold(deps, application).then(
    () => undefined,
    (error) => console.error(`[payments] ${application.reference}: hold not checked: ${error instanceof Error ? error.name : "unknown error"}`),
  )

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
    // The hold lapsed between read and capture: not an error, settlement treats it as nothing taken.
    console.warn(`[payments] ${reference}: the hold lapsed before it could be taken`)
    return payments.getPayment(id)
  }
}
