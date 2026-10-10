import "server-only"
import { join } from "node:path"
import { Migrator, readMigrations, type Migration } from "@/src/adapters/repository/postgres/migrator"
import { createPool } from "@/src/adapters/repository/postgres/pool"
import { PostgresApplicationRepository } from "@/src/adapters/repository/postgres/postgres-application-repository"
import { SupabaseDocumentStore } from "@/src/adapters/storage/supabase/supabase-document-store"
import { loadDocuments, loadSeed, seedDocumentsFor, seedFor } from "@/db/seed/seed"
import { parseEnv, parseKeyRotation, type Env, type EnvSource, type KeyRotation } from "./env"

const MIGRATIONS_DIRECTORY = join(process.cwd(), "db", "migrations")

const USAGE = "Usage: db up | db down [count | all] | db status | db seed | db reencrypt"

export async function runDatabaseCommand([command, count]: string[], source: EnvSource = process.env): Promise<string> {
  if (command === "reencrypt" && count === undefined) return reencrypt(parseKeyRotation(source))

  const env = parseEnv(source)
  if (env.REPOSITORY_DRIVER !== "postgres") {
    throw new Error(`REPOSITORY_DRIVER is ${env.REPOSITORY_DRIVER}: there is no database to migrate.`)
  }

  const migrator = async () => new Migrator(env.DIRECT_DATABASE_URL!, await readMigrations(MIGRATIONS_DIRECTORY), env.DATABASE_CA_CERT)

  if (command === "up" && count === undefined) {
    return report("Applied", await (await migrator()).up(), "Nothing to apply.")
  }
  if (command === "status" && count === undefined) {
    const statuses = await (await migrator()).status()
    return statuses.map(({ name, appliedAt }) => (appliedAt ? `applied ${appliedAt.toISOString()} ${name}` : `pending ${name}`)).join("\n")
  }
  if (command === "seed" && count === undefined) {
    const repository = new PostgresApplicationRepository({
      pool: createPool(env.DIRECT_DATABASE_URL!, env.DATABASE_CA_CERT),
      encryptionKey: env.CODES_ENCRYPTION_KEY!,
      retiredEncryptionKeys: env.RETIRED_CODES_ENCRYPTION_KEYS,
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

async function reencrypt(keys: KeyRotation): Promise<string> {
  const repository = new PostgresApplicationRepository({
    pool: createPool(keys.DIRECT_DATABASE_URL, keys.DATABASE_CA_CERT),
    encryptionKey: keys.CODES_ENCRYPTION_KEY,
    retiredEncryptionKeys: keys.RETIRED_CODES_ENCRYPTION_KEYS,
  })
  return `Re-encrypted ${await repository.reencrypt()} values under the current key.`
}

function loadSeededDocuments(env: Env): Promise<number> {
  const store = new SupabaseDocumentStore({
    url: env.SUPABASE_STORAGE_URL!,
    bucket: env.SUPABASE_STORAGE_BUCKET!,
    serviceKey: env.SUPABASE_STORAGE_SERVICE_KEY!,
  })
  return loadDocuments(store, seedDocumentsFor(env.APP_ENV))
}

function parseSteps(count = "1"): number {
  if (count === "all") return Infinity
  const steps = Number(count)
  if (!Number.isInteger(steps) || steps < 1) throw new Error(USAGE)
  return steps
}

const report = (verb: string, migrations: Migration[], none: string) =>
  migrations.length === 0 ? none : migrations.map(({ name }) => `${verb} ${name}`).join("\n")
