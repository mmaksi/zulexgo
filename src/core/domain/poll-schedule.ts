import type { IkfzStatus } from "./registration-authority"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** An online authority answers within minutes to hours: look often at first, then hourly. */
const ONLINE = [1, 2, 5, 10, 30].map((minutes) => minutes * MINUTE)
const ONLINE_AFTERWARDS = HOUR

/** Manual processing takes days: four checks on the first day, then one a day. */
const MANUAL = [6, 6, 6, 6].map((hours) => hours * HOUR)
const MANUAL_AFTERWARDS = 24 * HOUR

/**
 * When to next ask the registration service about an application. A table, so
 * API load is something to read rather than something scattered through the
 * poller: roughly 10–30 requests over an application's life.
 *
 * `attempts` is how many checks have been made so far and indexes the delay before the
 * next, so 0 gives the first delay; past the end of the table the "afterwards" interval
 * repeats. Any `ikfzStatus` but `online` is manual processing. `retryAfterMs` (the
 * service's Retry-After) can only lengthen the delay, never shorten it.
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
