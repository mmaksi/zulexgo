import { ValidationError } from "@/src/core/errors/validation-error"

// Zulex's enum lists `online` and `unavailable`; its description also names `offline`.
export type IkfzStatus = "online" | "unavailable" | "offline"

export interface RegistrationAuthority {
  readonly kreiscode: string
  readonly ikfzStatus: IkfzStatus
}

const SLOWEST_FIRST: IkfzStatus[] = ["offline", "unavailable", "online"]

export function combinedIkfzStatus(authorities: readonly RegistrationAuthority[], invalidField = "licencePlate.prefix"): IkfzStatus {
  if (authorities.length === 0) throw new ValidationError([invalidField])
  return SLOWEST_FIRST.find((status) => authorities.some((authority) => authority.ikfzStatus === status))!
}
