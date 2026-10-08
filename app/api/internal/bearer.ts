import { timingSafeEqual } from "node:crypto"

/**
 * Whether `request` presents `secret` as a bearer token, compared in constant time. Without a configured
 * secret nobody does: an internal route is closed, not open, until its stage sets `CRON_SECRET`.
 */
export function hasBearer(request: Request, secret: string | undefined): boolean {
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
