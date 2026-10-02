import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { Client } from "pg"

/** One `db/migrations/NNNN_slug` folder, read from disk. */
export interface Migration {
  /** The folder's number, which is also its position: versions run 1..N with no gaps. */
  readonly version: number
  /** The folder name, e.g. `0001_create_applications`. */
  readonly name: string
  readonly up: string
  readonly down: string
  /** SHA-256 over `up` and `down`; how a migration edited after it ran is noticed. */
  readonly checksum: string
}

/** `appliedAt` is unset while the migration is pending. */
export interface MigrationStatus {
  readonly name: string
  readonly appliedAt?: Date
}

/**
 * A migration problem a developer must fix: a malformed folder, a gap in the numbering, an applied
 * migration edited on disk, or SQL that failed (in which case it was rolled back first).
 */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MigrationError"
  }
}

/** `NNNN_snake_case_slug`; the capture group is the version. */
const FOLDER = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*$/
/** The README is required so each migration says why it exists and if it is safe on a live table. */
const REQUIRED_FILES = ["up.sql", "down.sql", "README.md"] as const

/**
 * `db/migrations/NNNN_slug/{up,down}.sql`, per the database-migrations skill. Stray files in the
 * directory are ignored; every folder must be a well-formed migration. Throws `MigrationError` for
 * a bad folder name, a missing file, or a number that is not the folder's position.
 */
export async function readMigrations(directory: string): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  // Zero-padded numbers make the name order the version order.
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  const migrations = await Promise.all(folders.map((folder) => readMigration(directory, folder)))

  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new MigrationError(`${migration.name}: expected number ${String(index + 1).padStart(4, "0")}; migrations must be numbered without gaps or duplicates.`)
    }
  })
  return migrations
}

async function readMigration(directory: string, name: string): Promise<Migration> {
  const match = FOLDER.exec(name)
  if (!match) throw new MigrationError(`${name}: folder must be named NNNN_snake_case_slug.`)

  const files = await readdir(join(directory, name))
  const missing = REQUIRED_FILES.filter((file) => !files.includes(file))
  if (missing.length > 0) throw new MigrationError(`${name}: missing ${missing.join(", ")}.`)

  const [up, down] = await Promise.all(["up.sql", "down.sql"].map((file) => readFile(join(directory, name, file), "utf8")))
  // The NUL keeps a line moved from the end of `up` to the start of `down` from hashing the same.
  // The README is left out, so its wording can be corrected after merge.
  const checksum = createHash("sha256").update(up).update("\0").update(down).digest("hex")
  return { version: Number(match[1]), name, up, down, checksum }
}

/**
 * Arbitrary but fixed: two deploys migrating at once queue behind it. Taken as a session-level
 * advisory lock, which Postgres drops when the connection closes, so a crashed run cannot keep it.
 */
const LOCK_KEY = 7_401_001

interface AppliedRow {
  version: number
  checksum: string
  applied_at: Date
}

/**
 * Applies and reverts migrations, one transaction each, recording version and
 * checksum in `schema_migrations`. A merged migration is immutable: if one that
 * already ran has changed on disk, nothing runs.
 *
 * Needs a session, not the app's transaction pooler: it holds an advisory lock across statements and
 * opens its own connection per call. `src/config/database.ts` gives it `DIRECT_DATABASE_URL`. Every
 * method waits for the lock, so concurrent runs (two deploys) go one after the other.
 */
export class Migrator {
  constructor(
    private readonly connectionString: string,
    private readonly migrations: readonly Migration[],
  ) {}

  /**
   * Applies every pending migration in order and returns them. Stops at the first failure with a
   * `MigrationError`; the ones before it stay applied and the failed one is rolled back.
   */
  up(): Promise<Migration[]> {
    return this.locked(async (client) => {
      const applied = await this.verifiedApplied(client)
      const pending = this.migrations.filter((migration) => !applied.has(migration.version))
      for (const migration of pending) {
        await transaction(client, migration, async () => {
          await client.query(migration.up)
          await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
            migration.version,
            migration.name,
            migration.checksum,
          ])
        })
      }
      return pending
    })
  }

  /**
   * Reverts the latest `steps` applied migrations, newest first, and returns them. Pass
   * `Infinity` to revert everything. The caller decides where this is allowed: it drops data, and
   * `src/config/database.ts` restricts it to dev.
   */
  down(steps: number): Promise<Migration[]> {
    return this.locked(async (client) => {
      const applied = await this.verifiedApplied(client)
      const latest = this.migrations.filter((migration) => applied.has(migration.version)).reverse().slice(0, steps)
      for (const migration of latest) {
        await transaction(client, migration, async () => {
          await client.query(migration.down)
          await client.query("DELETE FROM schema_migrations WHERE version = $1", [migration.version])
        })
      }
      return latest
    })
  }

  /**
   * Each known migration with when it ran, if it did. Unlike `up` and `down` it does not compare
   * checksums, so it still works on a database whose applied migrations were edited. It does create
   * `schema_migrations` if absent and waits for the lock, so it never reports mid-migration.
   */
  status(): Promise<MigrationStatus[]> {
    return this.locked(async (client) => {
      const applied = await appliedRows(client)
      return this.migrations.map(({ version, name }) => ({ name, appliedAt: applied.get(version)?.applied_at }))
    })
  }

  /** The applied rows by version, after proving none of their migrations changed on disk. */
  private async verifiedApplied(client: Client): Promise<Map<number, AppliedRow>> {
    const applied = await appliedRows(client)
    for (const migration of this.migrations) {
      const row = applied.get(migration.version)
      if (row && row.checksum !== migration.checksum) {
        throw new MigrationError(`${migration.name} has changed since it ran. Never edit a merged migration; add a new one.`)
      }
    }
    return applied
  }

  /** Runs `run` on a fresh connection holding the lock; closing the connection releases the lock. */
  private async locked<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: this.connectionString })
    await client.connect()
    try {
      await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY])
      await ensureMigrationsTable(client)
      return await run(client)
    } finally {
      await client.end()
    }
  }
}

/**
 * Created on first use, so a fresh database needs no bootstrap step.
 * Row-level security with no policy: only the table owner, the app, can read it.
 */
async function ensureMigrationsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
  `)
}

async function appliedRows(client: Client): Promise<Map<number, AppliedRow>> {
  const { rows } = await client.query<AppliedRow>("SELECT version, checksum, applied_at FROM schema_migrations")
  return new Map(rows.map((row) => [row.version, row]))
}

/**
 * Runs a migration's SQL and its `schema_migrations` bookkeeping in one transaction, so the schema
 * and the record of it commit or roll back together. Postgres DDL is transactional, so a failed
 * migration leaves nothing behind; the flip side is that a migration may not use statements Postgres
 * refuses inside a transaction, such as `CREATE INDEX CONCURRENTLY`. The SQL is sent without
 * parameters, which lets a file hold several statements.
 */
async function transaction(client: Client, migration: Migration, run: () => Promise<void>) {
  await client.query("BEGIN")
  try {
    await run()
    await client.query("COMMIT")
  } catch (error) {
    await client.query("ROLLBACK")
    throw new MigrationError(`${migration.name} failed and was rolled back: ${(error as Error).message}`)
  }
}
