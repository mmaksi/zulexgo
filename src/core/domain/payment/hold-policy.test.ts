import { HOLD_CAPTURE_MARGIN_MS, HOLD_CHECK_INTERVAL_MS, shouldCaptureAhead } from "./hold-policy"

const NOW = new Date("2026-03-01T09:00:00.000Z")
const held = (expiresInMs?: number) => ({
  status: "held" as const,
  holdExpiresAt: expiresInMs === undefined ? undefined : new Date(NOW.getTime() + expiresInMs),
})

describe("shouldCaptureAhead (Q20: capture in full before a hold can lapse)", () => {
  it("leaves a hold alone while it has more than the margin left", () => {
    expect(shouldCaptureAhead(held(HOLD_CAPTURE_MARGIN_MS + 1), NOW)).toBe(false)
  })

  it("takes the money once the hold is inside the margin, and exactly at it", () => {
    expect(shouldCaptureAhead(held(HOLD_CAPTURE_MARGIN_MS), NOW)).toBe(true)
    expect(shouldCaptureAhead(held(60_000), NOW)).toBe(true)
  })

  it("takes the money of a hold whose expiry the provider did not report, since it cannot be known safe", () => {
    expect(shouldCaptureAhead(held(), NOW)).toBe(true)
  })

  it.each(["captured", "released", "awaitingCustomer"] as const)("has nothing to take from a payment that is %s", (status) => {
    expect(shouldCaptureAhead({ status, holdExpiresAt: new Date(NOW.getTime() + 1000) }, NOW)).toBe(false)
  })

  it("leaves room for a missed check, so a check that runs late still lands inside the window", () => {
    expect(HOLD_CAPTURE_MARGIN_MS).toBeGreaterThanOrEqual(2 * HOLD_CHECK_INTERVAL_MS)
  })
})
