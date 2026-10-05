import { CARD_HOLD_LIFETIME_MS, HOLD_CAPTURE_MARGIN_MS, HOLD_CHECK_INTERVAL_MS } from "./hold-policy"
import {
  VERIFICATION_DEADLINE_AFTER_MS,
  VERIFICATION_REMINDER_AFTER_MS,
  nextVerificationCheckAt,
  verificationDeadlineAt,
  verificationDue,
  verificationReminderAt,
} from "./verification-policy"

const DAY = 24 * 60 * 60 * 1000
const STARTED = new Date("2026-03-01T09:00:00.000Z")
const after = (ms: number) => new Date(STARTED.getTime() + ms)
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DEADLINE = verificationDeadlineAt(STARTED)

describe("the verification deadline and reminder (launch plan Q48, provisional: a reminder after 2 days, a deadline after 4)", () => {
  it("counts each from the time it is given: the reminder from reaching status 2, the deadline from the payment", () => {
    expect(verificationReminderAt(STARTED)).toEqual(after(2 * DAY))
    expect(verificationDeadlineAt(STARTED)).toEqual(after(4 * DAY))
  })

  it("reminds before it expires", () => {
    expect(VERIFICATION_REMINDER_AFTER_MS).toBeLessThan(VERIFICATION_DEADLINE_AFTER_MS)
  })

  // The money is held on the customer's card while they have not verified. If the deadline ran past the guard's
  // margin, the guard would capture the payment of an order that is then cancelled for nothing, and refund it,
  // instead of releasing the hold untouched.
  describe("ends before the card hold would be captured ahead of its expiry (Q20)", () => {
    it("so a deadline that passes releases the hold untouched, never a captured payment", () => {
      expect(VERIFICATION_DEADLINE_AFTER_MS + HOLD_CAPTURE_MARGIN_MS).toBeLessThan(CARD_HOLD_LIFETIME_MS)
    })

    // The poller visits an order once per check interval, so it can find the deadline up to one interval late. The hold is
    // placed at checkout and the verification starts moments after payment is confirmed, so the count from `startedAt` is
    // the hold's own to within those moments. Whatever visits the order must also check the deadline before the hold.
    it("with one check interval to spare, so a visit that comes late still finds the deadline before the guard's margin", () => {
      expect(VERIFICATION_DEADLINE_AFTER_MS + HOLD_CAPTURE_MARGIN_MS + HOLD_CHECK_INTERVAL_MS).toBeLessThanOrEqual(CARD_HOLD_LIFETIME_MS)
    })
  })

  describe("verificationDue: what the poller does with an order waiting for the customer to verify", () => {
    it("leaves it alone while the reminder is not due", () => {
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: false }, after(0))).toBe("wait")
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: false }, after(2 * DAY - 1))).toBe("wait")
    })

    it("sends the reminder from the moment it is due, once", () => {
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: false }, after(2 * DAY))).toBe("remind")
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: false }, after(4 * DAY - 1))).toBe("remind")
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: true }, after(2 * DAY))).toBe("wait")
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: true }, after(4 * DAY - 1))).toBe("wait")
    })

    it("expires it at the deadline, and not a moment before", () => {
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: true }, after(4 * DAY))).toBe("expired")
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: true }, after(4 * DAY + 1))).toBe("expired")
    })

    it("expires an order whose reminder was never sent without sending it now, since the deadline has passed", () => {
      expect(verificationDue({ startedAt: STARTED, deadline: DEADLINE, reminderSent: false }, after(5 * DAY))).toBe("expired")
    })

    // The customer was told this deadline in email 2. A later change of the policy must not move it under them.
    it("enforces the deadline the customer was given, not the one the policy would give today", () => {
      const promised = after(6 * DAY)

      expect(verificationDue({ startedAt: STARTED, deadline: promised, reminderSent: true }, after(4 * DAY))).toBe("wait")
      expect(verificationDue({ startedAt: STARTED, deadline: promised, reminderSent: true }, after(6 * DAY))).toBe("expired")
    })
  })

  describe("nextVerificationCheckAt: when the poller next looks at an order waiting for the customer", () => {
    const check = (attempts: number, now: Date, reminderSent = true) => nextVerificationCheckAt({ startedAt: STARTED, deadline: DEADLINE, reminderSent, attempts, now })

    it("looks often at first, while the customer is probably verifying, then hourly", () => {
      const delays = [0, 1, 2, 3, 4, 5, 6].map((attempts) => check(attempts, STARTED).getTime() - STARTED.getTime())

      expect(delays).toEqual([1 * MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 30 * MINUTE, HOUR, HOUR])
    })

    it("is never later than the reminder, so it goes out when it is due and not an hour after", () => {
      const justBefore = after(VERIFICATION_REMINDER_AFTER_MS - 10 * MINUTE)

      expect(check(20, justBefore, false)).toEqual(verificationReminderAt(STARTED))
    })

    it("is never later than the deadline, so an order expires when it is due and not an hour after", () => {
      const justBefore = after(VERIFICATION_DEADLINE_AFTER_MS - 10 * MINUTE)

      expect(check(20, justBefore)).toEqual(DEADLINE)
    })

    it("ignores a reminder already sent, and one that is already due", () => {
      const afterReminder = after(VERIFICATION_REMINDER_AFTER_MS + 5 * MINUTE)

      expect(check(20, afterReminder, true).getTime() - afterReminder.getTime()).toBe(HOUR)
      expect(check(20, afterReminder, false).getTime() - afterReminder.getTime()).toBe(HOUR)
    })
  })
})
