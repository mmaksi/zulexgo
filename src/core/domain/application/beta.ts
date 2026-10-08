import type { OrderableService } from "./service"

/**
 * The beta of a service: before it is open to everyone, only people holding one of its invite codes
 * may order it, and only so many a day, so the first real orders can be watched one by one.
 */
export interface Beta {
  /**
   * The services in beta, each with the codes that open it, as `normaliseInvite` writes them.
   * A service with no entry is open to everyone.
   */
  readonly invites: Partial<Record<OrderableService, readonly string[]>>
  /** How many checkouts a service in beta takes a day. */
  readonly dailyPlaces: number
}

/** Shorter than this and a code can be guessed. */
export const MIN_INVITE_LENGTH = 8

/** A person types the code, so case and spaces do not matter; anything but text is no code. */
export const normaliseInvite = (input: unknown): string => (typeof input === "string" ? input.replace(/\s+/g, "").toUpperCase() : "")

export const isInBeta = (beta: Beta | undefined, service: OrderableService): beta is Beta =>
  beta !== undefined && Object.hasOwn(beta.invites, service)

/** Whether someone holding `invite` may order `service`: anyone may, for a service outside the beta. */
export function mayOrder(beta: Beta | undefined, service: OrderableService, invite: unknown): boolean {
  if (!isInBeta(beta, service)) return true
  const code = normaliseInvite(invite)
  return code !== "" && (beta.invites[service]?.includes(code) ?? false)
}
