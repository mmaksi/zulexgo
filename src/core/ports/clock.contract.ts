import type { Clock } from "./clock"

/** Every Clock adapter must pass this, including the fake. */
export function clockContract(name: string, makeSubject: () => Clock) {
  describe(`Clock contract: ${name}`, () => {
    it("returns a valid Date", () => {
      expect(makeSubject().now().getTime()).not.toBeNaN()
    })

    it("never moves backwards", () => {
      const clock = makeSubject()
      const readings = Array.from({ length: 20 }, () => clock.now().getTime())

      expect(readings).toEqual([...readings].sort((a, b) => a - b))
    })

    it("returns a fresh Date, so a caller cannot move the clock by mutating it", () => {
      const clock = makeSubject()
      const before = clock.now().getTime()

      clock.now().setFullYear(1999)

      expect(clock.now().getTime()).toBeGreaterThanOrEqual(before)
    })
  })
}
