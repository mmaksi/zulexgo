import type { RateLimit } from "@/src/core/ports/rate-limit/rate-limiter"

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export const RATE_LIMITS = {
  statusLookup: { max: 60, windowMs: MINUTE },
  documentDownload: { max: 20, windowMs: MINUTE },
  /** Counted whether or not the order exists. */
  resendLinkPerAddress: { max: 5, windowMs: HOUR },
  resendLinkPerOrder: { max: 3, windowMs: HOUR },
  /** Every attempt counts, invalid ones too. */
  orderChange: { max: 10, windowMs: HOUR },
  eligibilityLookup: { max: 30, windowMs: HOUR },
  checkout: { max: 10, windowMs: HOUR },
  /** Every attempt counts: the codes are the secret, and they are short. */
  inviteAttempt: { max: 10, windowMs: HOUR },
} as const satisfies Record<string, RateLimit>
