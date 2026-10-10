const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Provisional: launch plan Q48. The deadline must end before the hold guard captures (Q20).
export const VERIFICATION_REMINDER_AFTER_MS = 2 * DAY
export const VERIFICATION_DEADLINE_AFTER_MS = 4 * DAY

export const verificationReminderAt = (startedAt: Date): Date => new Date(startedAt.getTime() + VERIFICATION_REMINDER_AFTER_MS)
export const verificationDeadlineAt = (startedAt: Date): Date => new Date(startedAt.getTime() + VERIFICATION_DEADLINE_AFTER_MS)

export type VerificationDue = "wait" | "remind" | "expired"

interface Waiting {
  startedAt: Date
  deadline: Date
  reminderSent: boolean
}

export function verificationDue({ startedAt, deadline, reminderSent }: Waiting, now: Date): VerificationDue {
  if (now >= deadline) return "expired"
  if (!reminderSent && now >= verificationReminderAt(startedAt)) return "remind"
  return "wait"
}

const CHECK_DELAYS_MS = [1, 2, 5, 10, 30].map((minutes) => minutes * MINUTE)
const CHECK_AFTERWARDS_MS = HOUR

export function nextVerificationCheckAt({ startedAt, deadline, reminderSent, attempts, now }: Waiting & { attempts: number; now: Date }): Date {
  const usual = now.getTime() + (CHECK_DELAYS_MS[attempts] ?? CHECK_AFTERWARDS_MS)
  const reminderAt = verificationReminderAt(startedAt).getTime()
  const upcoming = [usual, deadline.getTime(), ...(reminderSent || reminderAt <= now.getTime() ? [] : [reminderAt])]
  return new Date(Math.min(...upcoming))
}
