const DAY = 24 * 60 * 60 * 1000

/**
 * Launch plan Q48, a provisional answer pending the founder: the customer is reminded after 2 days
 * and the wait ends after 4. The card is held while they have not verified, so the deadline must
 * end before the hold guard would take the money ahead of the hold's expiry (`HOLD_CAPTURE_MARGIN_MS`
 * before the hold lapses, Q20): an order cancelled at the deadline then releases its hold untouched,
 * since nothing was filed, instead of refunding a payment taken in full.
 */
export const VERIFICATION_REMINDER_AFTER_MS = 2 * DAY
export const VERIFICATION_DEADLINE_AFTER_MS = 4 * DAY

/** Both are counted from when the verification started: when the order reached status 2. */
export const verificationReminderAt = (startedAt: Date): Date => new Date(startedAt.getTime() + VERIFICATION_REMINDER_AFTER_MS)
export const verificationDeadlineAt = (startedAt: Date): Date => new Date(startedAt.getTime() + VERIFICATION_DEADLINE_AFTER_MS)

/** `expired`: cancel it. `remind`: send the reminder, once. `wait`: nothing is due yet. */
export type VerificationDue = "wait" | "remind" | "expired"

/**
 * What is due for an order waiting for the customer to verify. The deadline wins: an order past
 * it is cancelled whether or not it was reminded, and is never reminded after the deadline.
 */
export function verificationDue({ startedAt, reminderSent }: { startedAt: Date; reminderSent: boolean }, now: Date): VerificationDue {
  if (now >= verificationDeadlineAt(startedAt)) return "expired"
  if (!reminderSent && now >= verificationReminderAt(startedAt)) return "remind"
  return "wait"
}
