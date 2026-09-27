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
 * - Security codes, money and dates round-trip unchanged; what is returned is a
 *   copy, so mutating it never changes the store.
 * - A status token is stored so that it can be matched but never read back.
 *   Setting a new one revokes the old one.
 * - `findDueForPolling` returns only applications at the KBA whose poll is due,
 *   soonest first.
 */
export interface ApplicationRepository {
  create(application: Application): Promise<Application>
  get(reference: ApplicationReference): Promise<Application | undefined>
  update(application: Application): Promise<Application>
  setStatusToken(reference: ApplicationReference, token: string): Promise<void>
  findByStatusToken(token: string): Promise<Application | undefined>
  findDueForPolling(now: Date, limit: number): Promise<Application[]>
}
