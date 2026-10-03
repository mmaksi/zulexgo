const HOUR = 60 * 60 * 1000

/** How often an application waiting on money is looked at while nothing else would wake it. */
export const HOLD_CHECK_INTERVAL_MS = 24 * HOUR

/** After a failed look at a hold: try again soon, since the window to act is days, not a day. */
export const HOLD_RETRY_MS = HOUR

/**
 * How long before a card hold lapses its money is taken. Two check intervals, so
 * one missed or late check still lands inside the window (a hold lasts 7 days).
 */
export const HOLD_CAPTURE_MARGIN_MS = 2 * HOLD_CHECK_INTERVAL_MS

/**
 * Launch plan Q20, a provisional answer pending the founder: rather than let a
 * hold lapse, take the whole amount before it does. A captured payment refunds
 * the same way a held one is settled (total minus the fee on a failure), so the
 * refund rules do not change; only when the customer sees the charge does.
 * A hold whose expiry the provider did not report is taken at once: it cannot
 * be known to be safe.
 */
export function shouldCaptureAhead(payment: { status: string; holdExpiresAt?: Date }, now: Date): boolean {
  if (payment.status !== "held") return false
  return !payment.holdExpiresAt || payment.holdExpiresAt.getTime() - now.getTime() <= HOLD_CAPTURE_MARGIN_MS
}
