/**
 * The core never reads the system clock directly. Hold expiry, poll backoff and
 * rate-limit windows are all time-dependent, and a test that cannot control time
 * either sleeps or is flaky.
 *
 * Guarantees every adapter must honour:
 * - `now()` returns a fresh `Date`; mutating the result never moves the clock.
 * - Successive calls never move backwards.
 */
export interface Clock {
  /** The real adapter reads the system time; the fake stands still until a test moves it. */
  now(): Date
}
