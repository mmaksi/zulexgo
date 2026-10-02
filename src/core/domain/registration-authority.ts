import { ValidationError } from "@/src/core/errors/validation-error"

/**
 * i-Kfz availability of the authority responsible for a plate prefix. The Zulex
 * enum lists `online` and `unavailable`; its description also names `offline`.
 * Anything but `online` means manual processing, which can take days.
 */
export type IkfzStatus = "online" | "unavailable" | "offline"

/** An authority the registration service names for a plate prefix. */
export interface RegistrationAuthority {
  /** The vendor's district code for the authority (`kreiscode` in the Zulex API). */
  readonly kreiscode: string
  readonly ikfzStatus: IkfzStatus
}

/** Search order for `combinedIkfzStatus`: the first status any authority has wins. */
const SLOWEST_FIRST: IkfzStatus[] = ["offline", "unavailable", "online"]

/**
 * A prefix can span several authorities and we cannot tell which one decides, so expect the
 * slowest. Throws a `ValidationError` for `licencePlate.prefix` when the list is empty: no
 * authority answers for that prefix, which is then treated as an invalid prefix.
 */
export function combinedIkfzStatus(authorities: readonly RegistrationAuthority[]): IkfzStatus {
  if (authorities.length === 0) throw new ValidationError(["licencePlate.prefix"])
  return SLOWEST_FIRST.find((status) => authorities.some((authority) => authority.ikfzStatus === status))!
}
