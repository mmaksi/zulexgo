import type { RateLimit } from "@/src/core/ports/rate-limiter"

const MINUTE = 60_000

/**
 * How often one address may ask, per kind of request. A dashboard left open
 * refreshes twice a minute, so lookups are generous; a download is one click,
 * and a mailed link is the one abusable thing, so it is the tightest.
 */
export const RATE_LIMITS = {
  statusLookup: { max: 60, windowMs: MINUTE },
  documentDownload: { max: 20, windowMs: MINUTE },
} as const satisfies Record<string, RateLimit>
