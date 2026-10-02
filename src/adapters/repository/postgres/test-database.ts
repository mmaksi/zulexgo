import { randomBytes } from "node:crypto"
import { Client } from "pg"

/**
 * A Postgres server the suites may create and drop databases on, so it must be a throwaway one (a
 * local container; CI's service container). Read here rather than in `src/config/`: it is test
 * wiring, not application configuration.
 */
const serverUrl = process.env.TEST_DATABASE_URL

if (!serverUrl && process.env.CI) {
  throw new Error("TEST_DATABASE_URL must be set in CI, or the Postgres tests would silently skip.")
}

/**
 * Postgres suites run wherever TEST_DATABASE_URL is set, and CI always sets it (the check above
 * fails the run otherwise). Locally without it they report as skipped, not passed.
 */
export const describeWithPostgres: jest.Describe = serverUrl ? describe : describe.skip

/** A short-lived connection per use, so a suite never leaves one open to block `DROP DATABASE`. */
async function connected<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

export interface TestDatabase {
  /** Connection string for the adapter or `Migrator` under test; this suite's own database. */
  readonly url: string
  /** For assertions on what is really stored, beneath the adapter. */
  query(sql: string): Promise<Record<string, unknown>[]>
  /** Removes the database, closing any connection left open. Call it when the suite is done. */
  drop(): Promise<void>
}

/**
 * A fresh, empty database per suite, so suites running in parallel never share tables. It is empty
 * on purpose: the suite runs the real migrations into it, so the tests exercise the schema that ships.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  // Generated here, never from input, so interpolating it into CREATE/DROP DATABASE is safe.
  const name = `zulexgo_test_${randomBytes(6).toString("hex")}`
  const onServer = (sql: string) => connected(serverUrl!, (client) => client.query(sql))
  await onServer(`CREATE DATABASE ${name}`)

  const url = new URL(serverUrl!)
  url.pathname = `/${name}`

  return {
    url: url.toString(),
    query: (sql) => connected(url.toString(), async (client) => (await client.query(sql)).rows),
    // FORCE ends connections still open on it (Postgres 13 and later).
    drop: async () => {
      await onServer(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    },
  }
}
