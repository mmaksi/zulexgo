import type { Application } from "@/src/core/domain/application"
import type { ApplicationReference } from "@/src/core/domain/application-reference"

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
 * - `findDueForPolling` returns applications whose next check is due, soonest
 *   first: a status check at the KBA, a silent resubmission after a technical
 *   failure, or a look at the money of a 5b that waits for the customer.
 */
export interface ApplicationRepository {
  create(application: Application): Promise<Application>
  get(reference: ApplicationReference): Promise<Application | undefined>
  update(application: Application): Promise<Application>
  setStatusToken(reference: ApplicationReference, token: string): Promise<void>
  getStatusToken(reference: ApplicationReference): Promise<string | undefined>
  findByStatusToken(token: string): Promise<Application | undefined>
  findDueForPolling(now: Date, limit: number): Promise<Application[]>
}
