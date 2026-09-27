import { nextPollAt } from "./poll-schedule"

const NOW = new Date("2026-03-01T09:00:00.000Z")
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const after = (date: Date) => date.getTime() - NOW.getTime()

describe("nextPollAt (launch plan: status updates from Zulex)", () => {
  it("polls an online authority after 1, 2, 5, 10 and 30 minutes, then hourly", () => {
    const delays = [0, 1, 2, 3, 4, 5, 9].map((attempts) => after(nextPollAt({ ikfzStatus: "online", attempts, now: NOW })))

    expect(delays).toEqual([1, 2, 5, 10, 30, 60, 60].map((minutes) => minutes * MINUTE))
  })

  it.each(["unavailable", "offline"] as const)(
    "polls a %s authority, which processes by hand, every 6 hours for a day, then daily",
    (ikfzStatus) => {
      const delays = [0, 3, 4, 20].map((attempts) => after(nextPollAt({ ikfzStatus, attempts, now: NOW })))

      expect(delays).toEqual([6, 6, 24, 24].map((hours) => hours * HOUR))
    },
  )

  it("waits at least as long as the service's Retry-After", () => {
    expect(after(nextPollAt({ ikfzStatus: "online", attempts: 0, now: NOW, retryAfterMs: 15 * MINUTE }))).toBe(15 * MINUTE)
  })

  it("never polls sooner than the schedule because of a short Retry-After", () => {
    expect(after(nextPollAt({ ikfzStatus: "online", attempts: 5, now: NOW, retryAfterMs: MINUTE }))).toBe(HOUR)
  })
})
