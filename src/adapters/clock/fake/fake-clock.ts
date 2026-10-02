import type { Clock } from "@/src/core/ports/clock"

/** A fixed instant, so a test never depends on when it runs. */
const DEFAULT_START = new Date("2026-01-01T00:00:00.000Z")

/**
 * Stands still until moved, so hold expiry and poll backoff are testable without sleeping.
 * Time only moves forward, as the `Clock` port requires; a test crosses a deadline with
 * `advance` or `set`. Injected by tests directly; the container never wires it.
 */
export class FakeClock implements Clock {
  private instant: Date

  constructor(start: Date = DEFAULT_START) {
    this.instant = new Date(start)
  }

  now(): Date {
    return new Date(this.instant)
  }

  /** Moves the clock forward; a negative amount throws. */
  advance(milliseconds: number): void {
    if (milliseconds < 0) throw new Error("FakeClock cannot move backwards; the Clock port forbids it.")
    this.instant = new Date(this.instant.getTime() + milliseconds)
  }

  /** Jumps to a given instant at or after the current one; an earlier instant throws. */
  set(instant: Date): void {
    if (instant < this.instant) throw new Error("FakeClock cannot move backwards; the Clock port forbids it.")
    this.instant = new Date(instant)
  }
}
