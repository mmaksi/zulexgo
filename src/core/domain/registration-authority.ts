import { ValidationError } from "@/src/core/errors/validation-error"

/**
 * i-Kfz availability of the authority responsible for a plate prefix. The Zulex
 * enum lists `online` and `unavailable`; its description also names `offline`.
 * Anything but `online` means manual processing, which can take days.
 */
export type IkfzStatus = "online" | "unavailable" | "offline"

export interface RegistrationAuthority {
  readonly kreiscode: string
  readonly ikfzStatus: IkfzStatus
}

const SLOWEST_FIRST: IkfzStatus[] = ["offline", "unavailable", "online"]

/** A prefix can span several authorities and we cannot tell which one decides, so expect the slowest. */
export function combinedIkfzStatus(authorities: readonly RegistrationAuthority[]): IkfzStatus {
  if (authorities.length === 0) throw new ValidationError(["licencePlate.prefix"])
  return SLOWEST_FIRST.find((status) => authorities.some((authority) => authority.ikfzStatus === status))!
}
