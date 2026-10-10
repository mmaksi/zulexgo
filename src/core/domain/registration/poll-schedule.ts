import type { IkfzStatus } from "./registration-authority"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

const ONLINE = [1, 2, 5, 10, 30].map((minutes) => minutes * MINUTE)
const ONLINE_AFTERWARDS = HOUR

const MANUAL = [6, 6, 6, 6].map((hours) => hours * HOUR)
const MANUAL_AFTERWARDS = 24 * HOUR

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
