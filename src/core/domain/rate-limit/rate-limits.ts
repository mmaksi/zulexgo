import type { RateLimit } from "@/src/core/ports/rate-limit/rate-limiter"

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
  /**
   * Asking the Neuzulassung funnel which authority handles a postcode. Every call reaches the registration
   * service, and a customer asks once or twice, so only a caller trying postcodes in bulk meets the limit.
   */
  eligibilityLookup: { max: 30, windowMs: HOUR },
  /**
   * Opening a Neuzulassung checkout, which stores the customer's details and opens a payment at the
   * provider. Every attempt counts, invalid ones too. A customer opens one and retries a declined card on
   * the same order, so a few tries are plenty; a crowd behind one address (a carrier's shared one) still fits.
   */
  checkout: { max: 10, windowMs: HOUR },
  /** Redeeming an invite code, per caller, every attempt counted: the codes are the secret, and they are short. */
  inviteAttempt: { max: 10, windowMs: HOUR },
} as const satisfies Record<string, RateLimit>
