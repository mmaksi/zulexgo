import type { OrderableService } from "./service"

export interface Beta {
  readonly invites: Partial<Record<OrderableService, readonly string[]>>
  readonly dailyPlaces: number
}

export const MIN_INVITE_LENGTH = 8

export const normaliseInvite = (input: unknown): string => (typeof input === "string" ? input.replace(/\s+/g, "").toUpperCase() : "")

export const isInBeta = (beta: Beta | undefined, service: OrderableService): beta is Beta =>
  beta !== undefined && Object.hasOwn(beta.invites, service)

export function mayOrder(beta: Beta | undefined, service: OrderableService, invite: unknown): boolean {
  if (!isInBeta(beta, service)) return true
  const code = normaliseInvite(invite)
  return code !== "" && (beta.invites[service]?.includes(code) ?? false)
}
