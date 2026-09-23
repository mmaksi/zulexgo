import { clockContract } from "@/src/core/ports/clock.contract"
import { FakeClock } from "./fake-clock"

clockContract("FakeClock", () => new FakeClock())

describe("FakeClock", () => {
  it("stands still until it is advanced", () => {
    const clock = new FakeClock(new Date("2026-03-01T09:00:00.000Z"))

    expect(clock.now()).toEqual(clock.now())
  })

  it("advances by the requested number of milliseconds", () => {
    const clock = new FakeClock(new Date("2026-03-01T09:00:00.000Z"))

    clock.advance(90_000)

    expect(clock.now().toISOString()).toBe("2026-03-01T09:01:30.000Z")
  })

  it("refuses to move backwards, which the Clock port forbids", () => {
    const clock = new FakeClock(new Date("2026-03-01T09:00:00.000Z"))

    expect(() => clock.set(new Date("2026-02-01T09:00:00.000Z"))).toThrow(/backwards/)
  })
})
