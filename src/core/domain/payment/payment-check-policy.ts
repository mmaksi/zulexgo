import { CARD_HOLD_LIFETIME_MS } from "./hold-policy"

const MINUTE = 60_000

export const FIRST_PAYMENT_CHECK_MS = 15 * MINUTE

export const PAYMENT_RECHECK_MS = 60 * MINUTE

export const firstPaymentCheckAt = (orderedAt: Date): Date => new Date(orderedAt.getTime() + FIRST_PAYMENT_CHECK_MS)

export function nextPaymentCheckAt(orderedAt: Date, now: Date): Date | undefined {
  return now.getTime() - orderedAt.getTime() < CARD_HOLD_LIFETIME_MS ? new Date(now.getTime() + PAYMENT_RECHECK_MS) : undefined
}
