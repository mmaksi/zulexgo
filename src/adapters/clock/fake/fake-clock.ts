import type { Clock } from "@/src/core/ports/clock"

const DEFAULT_START = new Date("2026-01-01T00:00:00.000Z")

/** Stands still until moved, so hold expiry and poll backoff are testable without sleeping. */
export class FakeClock implements Clock {
  private instant: Date

  constructor(start: Date = DEFAULT_START) {
    this.instant = new Date(start)
  }

  now(): Date {
    return new Date(this.instant)
  }

  advance(milliseconds: number): void {
    if (milliseconds < 0) throw new Error("FakeClock cannot move backwards; the Clock port forbids it.")
    this.instant = new Date(this.instant.getTime() + milliseconds)
  }

  set(instant: Date): void {
    if (instant < this.instant) throw new Error("FakeClock cannot move backwards; the Clock port forbids it.")
    this.instant = new Date(instant)
  }
}
