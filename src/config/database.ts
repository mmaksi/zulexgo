import "server-only"
import { join } from "node:path"
import { Migrator, readMigrations, type Migration } from "@/src/adapters/repository/postgres/migrator"
import { PostgresApplicationRepository } from "@/src/adapters/repository/postgres/postgres-application-repository"
import { SupabaseDocumentStore } from "@/src/adapters/storage/supabase/supabase-document-store"
import { loadDocuments, loadSeed, seedDocumentsFor, seedFor } from "@/db/seed/seed"
import { parseEnv, type Env, type EnvSource } from "./env"

// Relative to the working directory, so the commands run from the repository root (the npm
// scripts do).
const MIGRATIONS_DIRECTORY = join(process.cwd(), "db", "migrations")

const USAGE = "Usage: db up | db down [count | all] | db status | db seed"

/**
 * `npm run db:migrate`, `db:migrate:down`, `db:status` and `db:seed`. They use
 * the direct session pooler connection, never the transaction pooler the app uses.
 *
 * Takes `[command, count]`: `up`, `status`, `seed`, or `down` with an optional
 * number of migrations (one by default) or `all`. Resolves to the text for
 * `scripts/db.ts` to print. A stage's own deploy runs `up`, and staging also
 * `seed`, before building (`scripts/vercel-build`).
 *
 * Guardrails: there must be a database to act on (`REPOSITORY_DRIVER=postgres`);
 * `down` drops data, so it runs only in dev; and the seed never loads in
 * production (`seedFor` throws). `seed` adds only what is missing, so running it
 * on every staging deploy is safe, and it fills the document bucket too when
 * `STORAGE_DRIVER` is supabase.
 *
 * The npm scripts run it under `--conditions=react-server`, so the `server-only`
 * import does not throw outside Next.js.
 *
 * @throws if the environment is invalid, there is no database, the command is
 * unknown (the error is the usage line), or `down` is attempted outside dev.
 */
export async function runDatabaseCommand([command, count]: string[], source: EnvSource = process.env): Promise<string> {
  const env = parseEnv(source)
  if (env.REPOSITORY_DRIVER !== "postgres") {
    throw new Error(`REPOSITORY_DRIVER is ${env.REPOSITORY_DRIVER}: there is no database to migrate.`)
  }

  const migrator = async () => new Migrator(env.DIRECT_DATABASE_URL!, await readMigrations(MIGRATIONS_DIRECTORY))

  if (command === "up" && count === undefined) {
    return report("Applied", await (await migrator()).up(), "Nothing to apply.")
  }
  if (command === "status" && count === undefined) {
    const statuses = await (await migrator()).status()
    return statuses.map(({ name, appliedAt }) => (appliedAt ? `applied ${appliedAt.toISOString()} ${name}` : `pending ${name}`)).join("\n")
  }
  if (command === "seed" && count === undefined) {
    const repository = new PostgresApplicationRepository({
      connectionString: env.DIRECT_DATABASE_URL!,
      encryptionKey: env.CODES_ENCRYPTION_KEY!,
    })
    const added = await loadSeed(repository, seedFor(env.APP_ENV))
    const documents = env.STORAGE_DRIVER === "supabase" ? await loadSeededDocuments(env) : 0
    if (added === 0 && documents === 0) return "Seed already loaded."
    return [added > 0 && `Seeded ${added} applications.`, documents > 0 && `Seeded ${documents} documents.`].filter(Boolean).join("\n")
  }
  if (command === "down") {
    const steps = parseSteps(count)
    if (env.APP_ENV !== "dev") throw new Error(`Reverting drops data, so it runs only in dev, not ${env.APP_ENV}. Write a new migration.`)
    return report("Reverted", await (await migrator()).down(steps), "Nothing to revert.")
  }
  throw new Error(USAGE)
}

/** Only a database-backed stage has a bucket to fill; in dev the document store is seeded in memory at boot. */
function loadSeededDocuments(env: Env): Promise<number> {
  const store = new SupabaseDocumentStore({
    url: env.SUPABASE_STORAGE_URL!,
    bucket: env.SUPABASE_STORAGE_BUCKET!,
    serviceKey: env.SUPABASE_STORAGE_SERVICE_KEY!,
  })
  return loadDocuments(store, seedDocumentsFor(env.APP_ENV))
}

/** How many migrations `down` reverts: a whole number of at least one, or "all". */
function parseSteps(count = "1"): number {
  if (count === "all") return Infinity
  const steps = Number(count)
  if (!Number.isInteger(steps) || steps < 1) throw new Error(USAGE)
  return steps
}

const report = (verb: string, migrations: Migration[], none: string) =>
  migrations.length === 0 ? none : migrations.map(({ name }) => `${verb} ${name}`).join("\n")
