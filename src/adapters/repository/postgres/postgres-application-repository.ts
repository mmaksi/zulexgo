import { DatabaseError, Pool, type PoolClient } from "pg"
import type { Application, StatusChange } from "@/src/core/domain/application/application"
import { parseApplicationReference, type ApplicationReference } from "@/src/core/domain/application/application-reference"
import { OPEN_STATUSES, POLLED_STATUSES, type ApplicationStatus } from "@/src/core/domain/application/application-status"
import type { Consent } from "@/src/core/domain/application/consent"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import type { OrderTrail } from "@/src/core/domain/application/order-report"
import type { OrderableService, Service, ServiceRequest } from "@/src/core/domain/application/service"
import { emailSchema } from "@/src/core/domain/customer/email"
import type { Failure } from "@/src/core/domain/registration/failure"
import { Money } from "@/src/core/domain/payment/money"
import type { IkfzStatus } from "@/src/core/domain/registration/registration-authority"
import { DuplicateApplication } from "@/src/core/errors/application/duplicate-application"
import { StaleApplication } from "@/src/core/errors/application/stale-application"
import type { ApplicationRepository } from "@/src/core/ports/repository/application-repository"
import { FieldCipher } from "./field-cipher"
import { detailsOf, requestFrom } from "./new-registration-details"

/**
 * One row of `SELECT_APPLICATION`, named as in db/migrations. `next_poll_at` is a timestamptz, which pg
 * returns as a Date; `history[].at` went through json_agg, so it is an ISO string until
 * `toApplication` parses it. The plate and the security codes are a de-registration's and the
 * details a Neuzulassung's: a check in migration 0010 fills the one set and empties the other.
 */
interface ApplicationRow {
  reference: string
  version: number
  status: ApplicationStatus
  email: string
  service: Service
  plate_count: 1 | 2 | null
  plate_prefix: string | null
  plate_letters: string | null
  plate_numbers: string | null
  vin: string
  encrypted_security_codes: string | null
  encrypted_details: string | null
  identity_verification_id: string | null
  identity_verification_deadline: Date | null
  identity_verification_reminder_sent: boolean
  authority_ikfz_status: IkfzStatus
  agb_version: string | null
  power_of_attorney_version: string | null
  consent_at: Date | null
  idempotency_key: string
  zulex_application_id: string | null
  retry_attempts: number
  failure_kind: Failure["kind"] | null
  failure_code: number | null
  next_poll_at: Date | null
  poll_attempts: number
  stripe_payment_intent_id: string
  total_cents: number
  history: { status: ApplicationStatus; at: string }[]
}

/**
 * Every read goes through this one query, so a loaded application is always whole: the order, its
 * payment (an inner join, since `create` writes both in one transaction) and its status history as a
 * JSON array in insertion order (`status_history.id` is an identity column). Callers append the WHERE.
 */
const SELECT_APPLICATION = `
  SELECT a.*, p.stripe_payment_intent_id, p.total_cents,
    (SELECT json_agg(json_build_object('status', h.status, 'at', h.changed_at) ORDER BY h.id)
       FROM status_history h WHERE h.application_reference = a.reference) AS history
  FROM applications a
  JOIN payments p ON p.application_reference = a.reference`

/**
 * The unique constraints that mean a domain `DuplicateApplication`, by the name Postgres reports.
 * Migration 0001 names the idempotency one explicitly; the other is the primary key's default name.
 * Any other unique violation (a payment intent id or Zulex application id already held elsewhere)
 * is not a case the domain handles, so it surfaces as the raw driver error.
 */
const DUPLICATES: Record<string, DuplicateApplication["field"]> = {
  applications_pkey: "reference",
  applications_idempotency_key_key: "idempotencyKey",
}

/**
 * Server-side only, through the Supavisor transaction pooler: every query is
 * unnamed, so no prepared statement outlives its transaction. Security codes,
 * a Neuzulassung's personal details, the identity provider's verification id and
 * status tokens are encrypted here, before they reach the database.
 *
 * Wired when `REPOSITORY_DRIVER=postgres` (the staging and production Supabase projects; production
 * rejects the in-memory fake). Concurrency is optimistic: `update` is a compare-and-set on `version`
 * and reports a lost race as `StaleApplication`, so no row is locked between a read and a write.
 * The tables have row-level security on and no policy (migration 0001), so only this connection, as
 * the table owner, can read them. The database holds codes, personal details and tokens only as
 * ciphertext (plus a SHA-256 of each token for lookup); see `FieldCipher`.
 */
export class PostgresApplicationRepository implements ApplicationRepository {
  private readonly pool: Pool
  private readonly cipher: FieldCipher

  /**
   * `encryptionKey` is `CODES_ENCRYPTION_KEY`: 32 bytes in base64, checked at boot in `env.ts`.
   * The app passes the pooled `DATABASE_URL`; `db:seed` passes the direct one.
   */
  constructor(options: { connectionString: string; encryptionKey: string }) {
    this.pool = new Pool({ connectionString: options.connectionString, allowExitOnIdle: true })
    // An idle connection dropped by the pooler must not crash the process; the next query reconnects.
    this.pool.on("error", (error) => console.error(`Postgres connection lost: ${error.message}`))
    this.cipher = new FieldCipher(options.encryptionKey)
  }

  async create(application: Application): Promise<Application> {
    // One transaction for all three tables: an order without its payment row would never load
    // (`SELECT_APPLICATION` joins it). Placeholders are built from the fixed column names in `columns`;
    // the values always travel as parameters.
    await this.transaction(async (client) => {
      // The stored version is 1 whatever the argument carries, as the port requires.
      const columns = { reference: application.reference, version: 1, ...this.columns(application) }
      const names = Object.keys(columns)
      await client.query(
        `INSERT INTO applications (${names.join(", ")}) VALUES (${names.map((_, index) => `$${index + 1}`).join(", ")})`,
        Object.values(columns),
      )
      await client.query(
        "INSERT INTO payments (application_reference, stripe_payment_intent_id, total_cents) VALUES ($1, $2, $3)",
        [application.reference, application.payment.id, application.payment.total.cents],
      )
      await appendHistory(client, application.reference, application.history)
    }).catch(rethrowDuplicate)

    // Read back rather than echo the input, so the caller gets what the database actually stored.
    return (await this.get(application.reference))!
  }

  async get(reference: ApplicationReference): Promise<Application | undefined> {
    return this.findOne(`${SELECT_APPLICATION} WHERE a.reference = $1`, [reference])
  }

  async update(application: Application): Promise<Application> {
    await this.transaction(async (client) => {
      const columns = this.columns(application)
      // $1 and $2 are the reference and the version read; the assignments start at $3.
      const assignments = Object.keys(columns).map((name, index) => `${name} = $${index + 3}`)
      // The compare-and-set: matches only while the stored version is still the one the caller read.
      // The UPDATE also holds the row's lock until commit, so a concurrent writer waits here, then
      // re-checks `version` and matches nothing.
      const { rowCount } = await client.query(
        `UPDATE applications SET ${assignments.join(", ")}, version = version + 1, updated_at = now()
         WHERE reference = $1 AND version = $2`,
        [application.reference, application.version, ...Object.values(columns)],
      )
      // No row matched: someone saved first, or the reference was never created (both stale).
      if (rowCount === 0) throw new StaleApplication(application.reference)

      await client.query(
        "UPDATE payments SET stripe_payment_intent_id = $2, total_cents = $3, updated_at = now() WHERE application_reference = $1",
        [application.reference, application.payment.id, application.payment.total.cents],
      )
      // History is append-only: store only the entries beyond those already saved. Counting is safe
      // because the UPDATE above holds the order's row lock, so no other writer can append meanwhile.
      const { rows } = await client.query<{ stored: number }>(
        "SELECT count(*)::int AS stored FROM status_history WHERE application_reference = $1",
        [application.reference],
      )
      await appendHistory(client, application.reference, application.history.slice(rows[0].stored))
    }).catch(rethrowDuplicate)

    return (await this.get(application.reference))!
  }

  /**
   * One row per application (it is the primary key), so the upsert replaces the previous token,
   * which revokes the old link. The database gets a SHA-256 of the token for lookup and an AES-GCM
   * copy bound to the reference, so a later email can repeat the link; never the token itself.
   * A token another application already holds breaks `token_hash`'s unique constraint, and an unknown
   * reference breaks the foreign key: both surface as the raw driver error, which the port allows.
   */
  async setStatusToken(reference: ApplicationReference, token: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO status_tokens (application_reference, token_hash, encrypted_token) VALUES ($1, $2, $3)
       ON CONFLICT (application_reference)
       DO UPDATE SET token_hash = EXCLUDED.token_hash, encrypted_token = EXCLUDED.encrypted_token, created_at = now()`,
      [reference, this.cipher.hash(token), this.cipher.encrypt(token, reference)],
    )
  }

  async getStatusToken(reference: ApplicationReference): Promise<string | undefined> {
    const { rows } = await this.pool.query<{ encrypted_token: string }>(
      "SELECT encrypted_token FROM status_tokens WHERE application_reference = $1",
      [reference],
    )
    return rows[0] && this.cipher.decrypt(rows[0].encrypted_token, reference)
  }

  /** Looks up by the token's hash, so the token itself never reaches the database. */
  async findByStatusToken(token: string): Promise<Application | undefined> {
    return this.findOne(
      `${SELECT_APPLICATION} JOIN status_tokens t ON t.application_reference = a.reference WHERE t.token_hash = $1`,
      [this.cipher.hash(token)],
    )
  }

  /**
   * A de-registration is looked up by plate and VIN (the `applications_by_vehicle` index, migration
   * 0007), a Neuzulassung by its VIN within its service (`applications_by_service_vin`, migration
   * 0010); statuses are `OPEN_STATUSES`.
   */
  async hasOpenApplication(vehicle: Parameters<ApplicationRepository["hasOpenApplication"]>[0]): Promise<boolean> {
    const { rows } =
      vehicle.service === "deregistration"
        ? await this.pool.query<{ open: boolean }>(
            `SELECT EXISTS (
               SELECT 1 FROM applications
               WHERE service = $1 AND plate_prefix = $2 AND plate_letters = $3 AND plate_numbers = $4 AND vin = $5 AND status = ANY($6)
             ) AS open`,
            [vehicle.service, vehicle.licencePlate.prefix, vehicle.licencePlate.letters, vehicle.licencePlate.numbers, vehicle.vin, OPEN_STATUSES],
          )
        : await this.pool.query<{ open: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM applications WHERE service = $1 AND vin = $2 AND status = ANY($3)) AS open",
            [vehicle.service, vehicle.vin, OPEN_STATUSES],
          )
    return rows[0].open
  }

  /**
   * Served by the partial index `applications_due_for_polling`; a NULL `next_poll_at` never compares
   * as due. Rows are not locked or claimed: two overlapping runs can be handed the same application,
   * and the one that saves second loses its version-checked `update` with `StaleApplication`.
   */
  async findDueForPolling(now: Date, limit: number): Promise<Application[]> {
    const { rows } = await this.pool.query<ApplicationRow>(
      `${SELECT_APPLICATION} WHERE a.status = ANY($1) AND a.next_poll_at <= $2 ORDER BY a.next_poll_at LIMIT $3`,
      [POLLED_STATUSES, now, limit],
    )
    return rows.map((row) => this.toApplication(row))
  }

  /**
   * Reads the status, the deadline and the history only, so nothing encrypted is selected, let alone
   * decrypted. "Created" is the first history entry, as the contract says, not `created_at`, which the
   * database sets and a test's clock cannot. Scans one service's orders; a monitoring read, not a request path.
   */
  async findTrailsSince(service: OrderableService, since: Date): Promise<readonly OrderTrail[]> {
    const { rows } = await this.pool.query<{ status: ApplicationStatus; verification_deadline: Date | null; history: ApplicationRow["history"] }>(
      `SELECT a.status, a.identity_verification_deadline AS verification_deadline,
         (SELECT json_agg(json_build_object('status', h.status, 'at', h.changed_at) ORDER BY h.id)
            FROM status_history h WHERE h.application_reference = a.reference) AS history
       FROM applications a
       WHERE a.service = $1
         AND (SELECT h.changed_at FROM status_history h WHERE h.application_reference = a.reference ORDER BY h.id LIMIT 1) >= $2`,
      [service, since],
    )
    return rows.map((row) => ({
      status: row.status,
      history: row.history.map(({ status, at }) => ({ status, at: new Date(at) })),
      verificationDeadline: row.verification_deadline ?? undefined,
    }))
  }

  /**
   * Every column an update may change; only the reference is fixed at creation.
   *
   * The only place security codes and a Neuzulassung's details are revealed in this adapter: a
   * de-registration's three codes go into one JSON blob and a Neuzulassung's request (but for its VIN)
   * into another, each encrypted straight away and bound to the reference. A missing front code is
   * dropped by `JSON.stringify`. The ciphertext differs on every call (random IV), so it is rewritten on each
   * update even when nothing changed. Of a failure only its kind and the KBA's code are
   * stored, never the vendor's description; the pair is held together by a CHECK in migration 0006.
   */
  private columns(application: Application) {
    return {
      status: application.status,
      email: application.email,
      ...this.requestColumns(application),
      authority_ikfz_status: application.ikfzStatus,
      agb_version: application.consent?.agbVersion ?? null,
      power_of_attorney_version: application.consent?.powerOfAttorneyVersion ?? null,
      consent_at: application.consent?.givenAt ?? null,
      idempotency_key: application.idempotencyKey,
      zulex_application_id: application.zulexApplicationId ?? null,
      retry_attempts: application.retryAttempts,
      failure_kind: application.failure?.kind ?? null,
      failure_code: application.failure?.kind === "kbaError" ? application.failure.code : null,
      identity_verification_id: application.identityVerification && this.cipher.encrypt(application.identityVerification.id, application.reference),
      identity_verification_deadline: application.identityVerification?.deadline ?? null,
      identity_verification_reminder_sent: application.identityVerification?.reminderSent ?? false,
      next_poll_at: application.polling.nextPollAt ?? null,
      poll_attempts: application.polling.attempts,
    }
  }

  /** The columns of the order's own service, the other service's set emptied (migration 0010 requires both). */
  private requestColumns({ request, reference }: Application) {
    const none = { plate_count: null, plate_prefix: null, plate_letters: null, plate_numbers: null, encrypted_security_codes: null, encrypted_details: null }
    switch (request.service) {
      case "deregistration": {
        const { rearPlate, frontPlate, certificate } = request.codes
        const codes = { rearPlate: rearPlate.reveal(), frontPlate: frontPlate?.reveal(), certificate: certificate.reveal() }
        return {
          ...none,
          service: request.service,
          plate_count: request.plateCount,
          plate_prefix: request.licencePlate.prefix,
          plate_letters: request.licencePlate.letters,
          plate_numbers: request.licencePlate.numbers,
          vin: request.vin,
          encrypted_security_codes: this.cipher.encrypt(JSON.stringify(codes), reference),
        }
      }
      case "newRegistration":
        return { ...none, service: request.service, vin: request.vin, encrypted_details: this.cipher.encrypt(detailsOf(request), reference) }
    }
  }

  /**
   * Read back through the domain parsers, so a row that no longer validates fails loudly.
   * Decrypting throws if the key is wrong or the ciphertext was altered or copied from another row;
   * the parser then rebuilds the `SecurityCode` objects from the decrypted blob.
   */
  private toApplication(row: ApplicationRow): Application {
    const reference = parseApplicationReference(row.reference)
    const history = row.history.map(({ status, at }) => ({ status, at: new Date(at) }))
    return {
      reference,
      version: row.version,
      status: row.status,
      history,
      request: this.toRequest(row, reference, history.at(-1)!.at),
      email: emailSchema.parse(row.email),
      consent: toConsent(row),
      ikfzStatus: row.authority_ikfz_status,
      idempotencyKey: row.idempotency_key,
      payment: { id: row.stripe_payment_intent_id, total: Money.ofCents(row.total_cents) },
      zulexApplicationId: row.zulex_application_id ?? undefined,
      retryAttempts: row.retry_attempts,
      failure: toFailure(row),
      identityVerification: this.toIdentityVerification(row, reference),
      polling: { nextPollAt: row.next_poll_at ?? undefined, attempts: row.poll_attempts },
    }
  }

  /**
   * The request of the row's service, from the columns migration 0010 fills for it (the `!`s hold
   * by that check). `lastChangeAt` is when the order last moved, which a Neuzulassung's keeper's age
   * is checked against again: never earlier than the day the details were entered, a correction
   * included. A row of any other service is one this release cannot read (the check refuses to
   * store one).
   */
  private toRequest(row: ApplicationRow, reference: ApplicationReference, lastChangeAt: Date): ServiceRequest {
    switch (row.service) {
      case "deregistration":
        return parseDeregistrationRequest({
          plateCount: row.plate_count,
          licencePlate: { prefix: row.plate_prefix, letters: row.plate_letters, numbers: row.plate_numbers },
          vin: row.vin,
          codes: JSON.parse(this.cipher.decrypt(row.encrypted_security_codes!, reference)),
        })
      case "newRegistration":
        return requestFrom(row.vin, this.cipher.decrypt(row.encrypted_details!, reference), lastChangeAt)
      default:
        throw new Error(`Application ${reference} is for a service this release cannot read`)
    }
  }

  /**
   * Id and deadline are stored together or not at all (a CHECK in migration 0010), so `deadline!` holds. The id is
   * ciphertext bound to the order (migration 0011), like a status token: the provider's id can be part of the customer's link.
   */
  private toIdentityVerification(row: ApplicationRow, reference: ApplicationReference): Application["identityVerification"] {
    if (row.identity_verification_id === null) return undefined
    return {
      id: this.cipher.decrypt(row.identity_verification_id, reference),
      deadline: row.identity_verification_deadline!,
      reminderSent: row.identity_verification_reminder_sent,
    }
  }

  /** For the `SELECT_APPLICATION` queries that match at most one row. */
  private async findOne(sql: string, values: unknown[]): Promise<Application | undefined> {
    const { rows } = await this.pool.query<ApplicationRow>(sql, values)
    return rows[0] && this.toApplication(rows[0])
  }

  /**
   * Runs `run` on one dedicated connection between BEGIN and COMMIT; any error rolls back and is
   * rethrown unchanged. A transaction needs the same connection throughout, so it cannot go through
   * `pool.query`, which may hand each statement to a different one.
   */
  private async transaction(run: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      await run(client)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
}

/** The version and the time are stored together (a CHECK in migration 0012), so `consent_at!` holds; an order made before consent was recorded has neither. */
function toConsent({ agb_version, power_of_attorney_version, consent_at }: ApplicationRow): Consent | undefined {
  if (agb_version === null) return undefined
  return {
    agbVersion: agb_version,
    ...(power_of_attorney_version === null ? {} : { powerOfAttorneyVersion: power_of_attorney_version }),
    givenAt: consent_at!,
  }
}

/** A code is stored exactly for `kbaError` (a CHECK in migration 0006), so `failure_code!` holds. */
function toFailure({ failure_kind, failure_code }: ApplicationRow): Failure | undefined {
  if (!failure_kind) return undefined
  return failure_kind === "kbaError" ? { kind: failure_kind, code: failure_code! } : { kind: failure_kind }
}

/** Inserts in order; the identity `id` then reproduces that order when the history is read back. */
async function appendHistory(client: PoolClient, reference: ApplicationReference, changes: readonly StatusChange[]) {
  for (const change of changes) {
    await client.query("INSERT INTO status_history (application_reference, status, changed_at) VALUES ($1, $2, $3)", [
      reference,
      change.status,
      change.at,
    ])
  }
}

/** Postgres code 23505 is a unique violation; only the `DUPLICATES` constraints become domain errors. */
function rethrowDuplicate(error: unknown): never {
  const field = error instanceof DatabaseError && error.code === "23505" && error.constraint ? DUPLICATES[error.constraint] : undefined
  throw field ? new DuplicateApplication(field) : error
}
