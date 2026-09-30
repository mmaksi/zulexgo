import type { RateLimit } from "@/src/core/ports/rate-limiter"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * How often one address may ask, per kind of request. A dashboard left open
 * refreshes twice a minute, so lookups are generous; a download is one click,
 * and a mailed link is the one abusable thing, so it is the tightest. A customer
 * corrects or cancels an order once or twice, and each try reaches the registration
 * service or moves money, so those are few.
 */
export const RATE_LIMITS = {
  statusLookup: { max: 60, windowMs: MINUTE },
  documentDownload: { max: 20, windowMs: MINUTE },
  resendLinkPerAddress: { max: 5, windowMs: HOUR },
  resendLinkPerOrder: { max: 3, windowMs: HOUR },
  orderChange: { max: 10, windowMs: HOUR },
} as const satisfies Record<string, RateLimit>
