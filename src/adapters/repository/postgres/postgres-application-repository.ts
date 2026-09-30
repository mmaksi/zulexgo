import { DatabaseError, Pool, type PoolClient } from "pg"
import type { Application, StatusChange } from "@/src/core/domain/application"
import { parseApplicationReference, type ApplicationReference } from "@/src/core/domain/application-reference"
import { POLLED_STATUSES, type ApplicationStatus } from "@/src/core/domain/application-status"
import { parseDeregistrationRequest } from "@/src/core/domain/deregistration-request"
import { emailSchema } from "@/src/core/domain/email"
import type { Failure } from "@/src/core/domain/failure"
import { Money } from "@/src/core/domain/money"
import type { IkfzStatus } from "@/src/core/domain/registration-authority"
import { DuplicateApplication } from "@/src/core/errors/duplicate-application"
import { StaleApplication } from "@/src/core/errors/stale-application"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"
import { FieldCipher } from "./field-cipher"

interface ApplicationRow {
  reference: string
  version: number
  status: ApplicationStatus
  email: string
  plate_count: 1 | 2
  plate_prefix: string
  plate_letters: string
  plate_numbers: string
  vin: string
  encrypted_security_codes: string
  authority_ikfz_status: IkfzStatus
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

const DUPLICATES: Record<string, DuplicateApplication["field"]> = {
  applications_pkey: "reference",
  applications_idempotency_key_key: "idempotencyKey",
}

/**
 * Server-side only, through the Supavisor transaction pooler: every query is
 * unnamed, so no prepared statement outlives its transaction. Security codes
 * and status tokens are encrypted here, before they reach the database.
 */
export class PostgresApplicationRepository implements ApplicationRepository {
  private readonly pool: Pool
  private readonly cipher: FieldCipher

  constructor(options: { connectionString: string; encryptionKey: string }) {
    this.pool = new Pool({ connectionString: options.connectionString, allowExitOnIdle: true })
    // An idle connection dropped by the pooler must not crash the process; the next query reconnects.
    this.pool.on("error", (error) => console.error(`Postgres connection lost: ${error.message}`))
    this.cipher = new FieldCipher(options.encryptionKey)
  }

  async create(application: Application): Promise<Application> {
    await this.transaction(async (client) => {
      const columns = { reference: application.reference, version: 1, idempotency_key: application.idempotencyKey, ...this.columns(application) }
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
      const { rows } = await client.query<{ stored: number }>(
        "SELECT count(*)::int AS stored FROM status_history WHERE application_reference = $1",
        [application.reference],
      )
      await appendHistory(client, application.reference, application.history.slice(rows[0].stored))
    })

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

  async findDueForPolling(now: Date, limit: number): Promise<Application[]> {
    const { rows } = await this.pool.query<ApplicationRow>(
      `${SELECT_APPLICATION} WHERE a.status = ANY($1) AND a.next_poll_at <= $2 ORDER BY a.next_poll_at LIMIT $3`,
      [POLLED_STATUSES, now, limit],
    )
    return rows.map((row) => this.toApplication(row))
  }

  /** Every column an update may change; the reference and idempotency key are fixed at creation. */
  private columns(application: Application) {
    const { request } = application
    const { rearPlate, frontPlate, certificate } = request.codes
    const codes = { rearPlate: rearPlate.reveal(), frontPlate: frontPlate?.reveal(), certificate: certificate.reveal() }
    return {
      status: application.status,
      email: application.email,
      plate_count: request.plateCount,
      plate_prefix: request.licencePlate.prefix,
      plate_letters: request.licencePlate.letters,
      plate_numbers: request.licencePlate.numbers,
      vin: request.vin,
      encrypted_security_codes: this.cipher.encrypt(JSON.stringify(codes), application.reference),
      authority_ikfz_status: application.ikfzStatus,
      zulex_application_id: application.zulexApplicationId ?? null,
      retry_attempts: application.retryAttempts,
      failure_kind: application.failure?.kind ?? null,
      failure_code: application.failure?.kind === "kbaError" ? application.failure.code : null,
      next_poll_at: application.polling.nextPollAt ?? null,
      poll_attempts: application.polling.attempts,
    }
  }

  /** Read back through the domain parsers, so a row that no longer validates fails loudly. */
  private toApplication(row: ApplicationRow): Application {
    const reference = parseApplicationReference(row.reference)
    return {
      reference,
      version: row.version,
      status: row.status,
      history: row.history.map(({ status, at }) => ({ status, at: new Date(at) })),
      request: parseDeregistrationRequest({
        plateCount: row.plate_count,
        licencePlate: { prefix: row.plate_prefix, letters: row.plate_letters, numbers: row.plate_numbers },
        vin: row.vin,
        codes: JSON.parse(this.cipher.decrypt(row.encrypted_security_codes, reference)),
      }),
      email: emailSchema.parse(row.email),
      ikfzStatus: row.authority_ikfz_status,
      idempotencyKey: row.idempotency_key,
      payment: { id: row.stripe_payment_intent_id, total: Money.ofCents(row.total_cents) },
      zulexApplicationId: row.zulex_application_id ?? undefined,
      retryAttempts: row.retry_attempts,
      failure: toFailure(row),
      polling: { nextPollAt: row.next_poll_at ?? undefined, attempts: row.poll_attempts },
    }
  }

  private async findOne(sql: string, values: unknown[]): Promise<Application | undefined> {
    const { rows } = await this.pool.query<ApplicationRow>(sql, values)
    return rows[0] && this.toApplication(rows[0])
  }

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

function toFailure({ failure_kind, failure_code }: ApplicationRow): Failure | undefined {
  if (!failure_kind) return undefined
  return failure_kind === "kbaError" ? { kind: failure_kind, code: failure_code! } : { kind: failure_kind }
}

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
