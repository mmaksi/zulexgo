import type { IkfzStatus } from "./registration-authority"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const ONLINE = [1, 2, 5, 10, 30].map((minutes) => minutes * MINUTE)
const ONLINE_AFTERWARDS = HOUR

/** Manual processing takes days: four checks on the first day, then one a day. */
const MANUAL = [6, 6, 6, 6].map((hours) => hours * HOUR)
const MANUAL_AFTERWARDS = 24 * HOUR

/**
 * When to next ask the registration service about an application. A table, so
 * API load is something to read rather than something scattered through the
 * poller: roughly 10–30 requests over an application's life.
 */
export function nextPollAt({
  ikfzStatus,
  attempts,
  now,
  retryAfterMs = 0,
}: {
  ikfzStatus: IkfzStatus
  attempts: number
  now: Date
  retryAfterMs?: number
}): Date {
  const [schedule, afterwards] = ikfzStatus === "online" ? [ONLINE, ONLINE_AFTERWARDS] : [MANUAL, MANUAL_AFTERWARDS]
  const delay = Math.max(schedule[attempts] ?? afterwards, retryAfterMs)
  return new Date(now.getTime() + delay)
}
