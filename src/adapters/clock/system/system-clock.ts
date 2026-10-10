import type { Clock } from "@/src/core/ports/clock/clock"

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}
