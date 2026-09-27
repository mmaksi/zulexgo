import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { Client } from "pg"

export interface Migration {
  readonly version: number
  readonly name: string
  readonly up: string
  readonly down: string
  readonly checksum: string
}

export interface MigrationStatus {
  readonly name: string
  readonly appliedAt?: Date
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MigrationError"
  }
}

const FOLDER = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*$/
const REQUIRED_FILES = ["up.sql", "down.sql", "README.md"] as const

/** `db/migrations/NNNN_slug/{up,down}.sql`, per the database-migrations skill. */
export async function readMigrations(directory: string): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true })
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
  const checksum = createHash("sha256").update(up).update("\0").update(down).digest("hex")
  return { version: Number(match[1]), name, up, down, checksum }
}

/** Arbitrary but fixed: two deploys migrating at once queue behind it. */
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
 */
export class Migrator {
  constructor(
    private readonly connectionString: string,
    private readonly migrations: readonly Migration[],
  ) {}

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

  status(): Promise<MigrationStatus[]> {
    return this.locked(async (client) => {
      const applied = await appliedRows(client)
      return this.migrations.map(({ version, name }) => ({ name, appliedAt: applied.get(version)?.applied_at }))
    })
  }

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

/** Row-level security with no policy: only the table owner, the app, can read it. */
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
