import type { RateLimit } from "@/src/core/ports/rate-limiter"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * How often one address may ask, per kind of request. An address is the caller's network
 * address; only `resendLinkPerOrder` counts per order instead. A dashboard left open
 * refreshes twice a minute, so lookups are generous; a download is one click,
 * and a mailed link is the one abusable thing, so it is the tightest. A customer
 * corrects or cancels an order once or twice, and each try reaches the registration
 * service or moves money, so those are few.
 */
export const RATE_LIMITS = {
  /** Opening a status page by its link. */
  statusLookup: { max: 60, windowMs: MINUTE },
  /** Downloading a document from a status page. */
  documentDownload: { max: 20, windowMs: MINUTE },
  /** "Resend my link", per caller, counted whether or not the order exists. */
  resendLinkPerAddress: { max: 5, windowMs: HOUR },
  /** "Resend my link", per order whoever asks, so a crowd cannot flood one customer's inbox. */
  resendLinkPerOrder: { max: 3, windowMs: HOUR },
  /** Cancelling or correcting an order. Every attempt counts, invalid ones too. */
  orderChange: { max: 10, windowMs: HOUR },
} as const satisfies Record<string, RateLimit>
