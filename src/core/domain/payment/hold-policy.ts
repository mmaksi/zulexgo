const HOUR = 60 * 60 * 1000

// Stripe's authorisation validity for an online card payment.
export const CARD_HOLD_LIFETIME_MS = 7 * 24 * HOUR

export const HOLD_CHECK_INTERVAL_MS = 24 * HOUR

export const HOLD_RETRY_MS = HOUR

export const HOLD_CAPTURE_MARGIN_MS = 2 * HOLD_CHECK_INTERVAL_MS

// Provisional: launch plan Q20
export function shouldCaptureAhead(payment: { status: string; holdExpiresAt?: Date }, now: Date): boolean {
  if (payment.status !== "held") return false
  return !payment.holdExpiresAt || payment.holdExpiresAt.getTime() - now.getTime() <= HOLD_CAPTURE_MARGIN_MS
}
