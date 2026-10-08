import type { Clock } from "@/src/core/ports/clock/clock"

/**
 * `Clock` on the wall clock, the one place in the app that reads it; real in every stage,
 * dev included. Each call builds a new `Date`, so a caller cannot move it. It is the host's
 * time: a system clock correction could step it backwards, which the port assumes away.
 */
export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}
