import type { Application } from "@/src/core/domain/application/application"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { DeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import type { NewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"

/**
 * Where applications live between requests. Owns our status machine's state,
 * not the vendor's.
 *
 * Guarantees every adapter must honour:
 * - `create` stores version 1 and rejects a reused reference or idempotency key
 *   with `DuplicateApplication`.
 * - `update` succeeds only if the stored version equals the given one, then
 *   stores version + 1; otherwise `StaleApplication` and nothing changes. The
 *   poller and a webhook can therefore never both advance one application.
 *   Everything but the reference may change, the idempotency key included (a
 *   correction that files the order afresh takes a new one), and it may not
 *   take one another application holds: `DuplicateApplication`.
 * - Security codes, money and dates round-trip unchanged; what is returned is a
 *   copy, so mutating it never changes the store.
 * - A status token can be matched and read back, so every email can carry the
 *   same link; adapters that persist it keep it encrypted and look it up by
 *   hash. Setting a new one revokes the old one.
 * - `hasOpenApplication` says whether a paid order that is not finished exists
 *   for the car: for a de-registration the same plate and VIN, for a Neuzulassung (a car
 *   with no plate yet) the VIN; one still awaiting payment, completed, failed for
 *   good or cancelled does not count, nor does one for another service. It says nothing
 *   more: no reference, no status.
 * - `findDueForPolling` returns applications whose next check is due, soonest
 *   first: a status check at the KBA, a silent resubmission after a technical
 *   failure, or a look at the money of a 5b that waits for the customer.
 */
export interface ApplicationRepository {
  /**
   * Stores a new order and returns it at version 1, whatever version the
   * argument carries. `DuplicateApplication` names the field that is taken:
   * `reference` lets checkout draw a fresh one, `idempotencyKey` is a double
   * submit. Nothing is stored in either case.
   */
  create(application: Application): Promise<Application>
  /** `undefined`, not an error, for a reference nobody holds. */
  get(reference: ApplicationReference): Promise<Application | undefined>
  /**
   * Saves the whole application, given the version it was read at, and returns
   * the stored copy at version + 1. `StaleApplication` means someone else saved
   * first: reload and decide again. An application that was never created is
   * stale too. The status history only grows: callers pass the full history
   * that `applyEvent` builds, and the Postgres adapter stores just the entries
   * beyond those already saved.
   */
  update(application: Application): Promise<Application>
  /**
   * Makes `token` the one link that opens this order, revoking the previous
   * one. Rejects (with an adapter's own error, not a domain error) when the
   * order does not exist or another order already holds the token, so one link
   * never opens two orders. The token is the order's only credential:
   * adapters never log it.
   */
  setStatusToken(reference: ApplicationReference, token: string): Promise<void>
  /**
   * The current token, so a later email repeats the link already issued.
   * `undefined` until one is set (an order awaiting payment has none) and for
   * an unknown order.
   */
  getStatusToken(reference: ApplicationReference): Promise<string | undefined>
  /**
   * Only the current token matches: a revoked or invented one finds nothing,
   * which callers turn into `TokenInvalid`.
   */
  findByStatusToken(token: string): Promise<Application | undefined>
  /**
   * The service, and what names the car for it, must all match: plate (prefix, letters, numbers)
   * and VIN for a de-registration, the VIN for a Neuzulassung. Takes the request itself, as
   * checkout holds it. Advisory, not a lock: two checkouts racing can both see `false`.
   */
  hasOpenApplication(vehicle: Pick<DeregistrationRequest, "service" | "licencePlate" | "vin"> | Pick<NewRegistrationRequest, "service" | "vin">): Promise<boolean>
  /**
   * Due means `polling.nextPollAt <= now`, a moment exactly equal to `now`
   * included, among the statuses that are polled at all. An application
   * without a `nextPollAt` is never due: clearing it is how the poller stops
   * watching one. Applications with equal times come back in no set order.
   */
  findDueForPolling(now: Date, limit: number): Promise<Application[]>
}
