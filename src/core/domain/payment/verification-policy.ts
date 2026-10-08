const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Launch plan Q48, a provisional answer pending the founder: the customer is reminded after 2 days
 * and the wait ends after 4. The card is held while they have not verified, so the deadline must
 * end before the hold guard would take the money ahead of the hold's expiry (`HOLD_CAPTURE_MARGIN_MS`
 * before the hold lapses, Q20): an order cancelled at the deadline then releases its hold untouched,
 * since nothing was filed, instead of refunding a payment taken in full.
 */
export const VERIFICATION_REMINDER_AFTER_MS = 2 * DAY
export const VERIFICATION_DEADLINE_AFTER_MS = 4 * DAY

/**
 * The reminder counts from when the order reached status 2. The deadline counts from the payment (status 1): a start
 * that is retried repeats the deadline already told to the customer, and it is never later than the card hold's own clock.
 */
export const verificationReminderAt = (startedAt: Date): Date => new Date(startedAt.getTime() + VERIFICATION_REMINDER_AFTER_MS)
export const verificationDeadlineAt = (startedAt: Date): Date => new Date(startedAt.getTime() + VERIFICATION_DEADLINE_AFTER_MS)

/** `expired`: cancel it. `remind`: send the reminder, once. `wait`: nothing is due yet. */
export type VerificationDue = "wait" | "remind" | "expired"

/** What the poller reads of an order waiting for the customer to verify. */
interface Waiting {
  /** When the order reached status 2: the reminder counts from here. */
  startedAt: Date
  /** The deadline the customer was given, stored with the order: a later change of the policy never moves it. */
  deadline: Date
  reminderSent: boolean
}

/**
 * What is due for an order waiting for the customer to verify. The deadline wins: an order past
 * it is cancelled whether or not it was reminded, and is never reminded after the deadline.
 */
export function verificationDue({ startedAt, deadline, reminderSent }: Waiting, now: Date): VerificationDue {
  if (now >= deadline) return "expired"
  if (!reminderSent && now >= verificationReminderAt(startedAt)) return "remind"
  return "wait"
}

/** The customer is probably verifying while the page is open: look every few minutes at first, then hourly. */
const CHECK_DELAYS_MS = [1, 2, 5, 10, 30].map((minutes) => minutes * MINUTE)
const CHECK_AFTERWARDS_MS = HOUR

/**
 * When the poller next looks at an order waiting for the customer. `attempts` is how many checks were
 * made and indexes the delay before the next. The look never comes later than the reminder (until it
 * is sent) or the deadline, so each happens when it is due and not up to an hour after.
 */
export function nextVerificationCheckAt({ startedAt, deadline, reminderSent, attempts, now }: Waiting & { attempts: number; now: Date }): Date {
  const usual = now.getTime() + (CHECK_DELAYS_MS[attempts] ?? CHECK_AFTERWARDS_MS)
  const reminderAt = verificationReminderAt(startedAt).getTime()
  const upcoming = [usual, deadline.getTime(), ...(reminderSent || reminderAt <= now.getTime() ? [] : [reminderAt])]
  return new Date(Math.min(...upcoming))
}
