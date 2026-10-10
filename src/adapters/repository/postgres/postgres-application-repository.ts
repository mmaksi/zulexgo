import { DatabaseError, Pool, type PoolClient } from "pg"
import type { Application, StatusChange } from "@/src/core/domain/application/application"
import { parseApplicationReference, type ApplicationReference } from "@/src/core/domain/application/application-reference"
import { OPEN_STATUSES, POLLED_STATUSES, type ApplicationStatus } from "@/src/core/domain/application/application-status"
import type { Consent } from "@/src/core/domain/application/consent"
import { parseStoredDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
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
import { tlsFor } from "./tls"

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

const SELECT_APPLICATION = `
  SELECT a.*, p.stripe_payment_intent_id, p.total_cents,
    (SELECT json_agg(json_build_object('status', h.status, 'at', h.changed_at) ORDER BY h.id)
       FROM status_history h WHERE h.application_reference = a.reference) AS history
  FROM applications a
  JOIN payments p ON p.application_reference = a.reference`

// Postgres's constraint names; renaming either in a migration silently turns duplicates into raw errors.
const DUPLICATES: Record<string, DuplicateApplication["field"]> = {
  applications_pkey: "reference",
  applications_idempotency_key_key: "idempotencyKey",
}

// Supavisor's transaction pooler: queries must stay unnamed (no prepared statements).
export class PostgresApplicationRepository implements ApplicationRepository {
  private readonly pool: Pool
  private readonly cipher: FieldCipher

  constructor(options: { connectionString: string; encryptionKey: string; ca?: string }) {
    this.pool = new Pool({ connectionString: options.connectionString, ssl: tlsFor(options.connectionString, options.ca), allowExitOnIdle: true })
    // An idle connection dropped by the pooler must not crash the process; the next query reconnects.
    this.pool.on("error", (error) => console.error(`Postgres connection lost: ${error.message}`))
    this.cipher = new FieldCipher(options.encryptionKey)
  }

  async create(application: Application): Promise<Application> {
    // Column names are fixed in `columns`; values always travel as parameters.
    await this.transaction(async (client) => {
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

    return (await this.get(application.reference))!
  }

  async get(reference: ApplicationReference): Promise<Application | undefined> {
    return this.findOne(`${SELECT_APPLICATION} WHERE a.reference = $1`, [reference])
  }

  async update(application: Application): Promise<Application> {
    await this.transaction(async (client) => {
      const columns = this.columns(application)
      const assignments = Object.keys(columns).map((name, index) => `${name} = $${index + 3}`)
      // Compare-and-set: the row lock makes a concurrent writer wait, re-check version and match nothing.
      const { rowCount } = await client.query(
        `UPDATE applications SET ${assignments.join(", ")}, version = version + 1, updated_at = now()
         WHERE reference = $1 AND version = $2`,
        [application.reference, application.version, ...Object.values(columns)],
      )
      if (rowCount === 0) throw new StaleApplication(application.reference)

      await client.query(
        "UPDATE payments SET stripe_payment_intent_id = $2, total_cents = $3, updated_at = now() WHERE application_reference = $1",
        [application.reference, application.payment.id, application.payment.total.cents],
      )
      // Append-only; counting is safe because the UPDATE above holds the order's row lock.
      const { rows } = await client.query<{ stored: number }>(
        "SELECT count(*)::int AS stored FROM status_history WHERE application_reference = $1",
        [application.reference],
      )
      await appendHistory(client, application.reference, application.history.slice(rows[0].stored))
    }).catch(rethrowDuplicate)

    return (await this.get(application.reference))!
  }

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

  async findByStatusToken(token: string): Promise<Application | undefined> {
    return this.findOne(
      `${SELECT_APPLICATION} JOIN status_tokens t ON t.application_reference = a.reference WHERE t.token_hash = $1`,
      [this.cipher.hash(token)],
    )
  }

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

  // Rows are not claimed: overlapping runs may get the same order; the later save fails as StaleApplication.
  async findDueForPolling(now: Date, limit: number): Promise<Application[]> {
    const { rows } = await this.pool.query<ApplicationRow>(
      `${SELECT_APPLICATION} WHERE a.status = ANY($1) AND a.next_poll_at <= $2 ORDER BY a.next_poll_at LIMIT $3`,
      [POLLED_STATUSES, now, limit],
    )
    return rows.map((row) => this.toApplication(row))
  }

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
      // The provider's id can be part of the customer's link, so it is encrypted like a status token.
      identity_verification_id: application.identityVerification && this.cipher.encrypt(application.identityVerification.id, application.reference),
      identity_verification_deadline: application.identityVerification?.deadline ?? null,
      identity_verification_reminder_sent: application.identityVerification?.reminderSent ?? false,
      next_poll_at: application.polling.nextPollAt ?? null,
      poll_attempts: application.polling.attempts,
    }
  }

  private requestColumns({ request, reference }: Application) {
    const none = { plate_count: null, plate_prefix: null, plate_letters: null, plate_numbers: null, encrypted_security_codes: null, encrypted_details: null }
    switch (request.service) {
      case "deregistration": {
        const { codes } = request
        const revealed = codes && { rearPlate: codes.rearPlate.reveal(), frontPlate: codes.frontPlate?.reveal(), certificate: codes.certificate.reveal() }
        return {
          ...none,
          service: request.service,
          plate_count: request.plateCount,
          plate_prefix: request.licencePlate.prefix,
          plate_letters: request.licencePlate.letters,
          plate_numbers: request.licencePlate.numbers,
          vin: request.vin,
          encrypted_security_codes: revealed ? this.cipher.encrypt(JSON.stringify(revealed), reference) : null,
        }
      }
      case "newRegistration":
        return { ...none, service: request.service, vin: request.vin, encrypted_details: this.cipher.encrypt(detailsOf(request), reference) }
    }
  }

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

  private toRequest(row: ApplicationRow, reference: ApplicationReference, lastChangeAt: Date): ServiceRequest {
    switch (row.service) {
      case "deregistration":
        return parseStoredDeregistrationRequest({
          plateCount: row.plate_count,
          licencePlate: { prefix: row.plate_prefix, letters: row.plate_letters, numbers: row.plate_numbers },
          vin: row.vin,
          codes: row.encrypted_security_codes === null ? undefined : JSON.parse(this.cipher.decrypt(row.encrypted_security_codes, reference)),
        })
      case "newRegistration":
        return requestFrom(row.vin, this.cipher.decrypt(row.encrypted_details!, reference), lastChangeAt)
      default:
        throw new Error(`Application ${reference} is for a service this release cannot read`)
    }
  }

  private toIdentityVerification(row: ApplicationRow, reference: ApplicationReference): Application["identityVerification"] {
    if (row.identity_verification_id === null) return undefined
    return {
      id: this.cipher.decrypt(row.identity_verification_id, reference),
      deadline: row.identity_verification_deadline!,
      reminderSent: row.identity_verification_reminder_sent,
    }
  }

  private async findOne(sql: string, values: unknown[]): Promise<Application | undefined> {
    const { rows } = await this.pool.query<ApplicationRow>(sql, values)
    return rows[0] && this.toApplication(rows[0])
  }

  // pool.query may use a different connection per statement, so a transaction needs its own client.
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

function toConsent({ agb_version, power_of_attorney_version, consent_at }: ApplicationRow): Consent | undefined {
  if (agb_version === null) return undefined
  return {
    agbVersion: agb_version,
    ...(power_of_attorney_version === null ? {} : { powerOfAttorneyVersion: power_of_attorney_version }),
    givenAt: consent_at!,
  }
}

function toFailure({ failure_kind, failure_code }: ApplicationRow): Failure | undefined {
  if (!failure_kind) return undefined
  return failure_kind === "kbaError" ? { kind: failure_kind, code: failure_code! } : { kind: failure_kind }
}

// Sequential on purpose: the identity id records insertion order, which the history is read back in.
async function appendHistory(client: PoolClient, reference: ApplicationReference, changes: readonly StatusChange[]) {
  for (const change of changes) {
    await client.query("INSERT INTO status_history (application_reference, status, changed_at) VALUES ($1, $2, $3)", [
      reference,
      change.status,
      change.at,
    ])
  }
}

function rethrowDuplicate(error: unknown): never {
  const field = error instanceof DatabaseError && error.code === "23505" && error.constraint ? DUPLICATES[error.constraint] : undefined
  throw field ? new DuplicateApplication(field) : error
}
