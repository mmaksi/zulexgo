import { randomBytes } from "node:crypto"
import { Client } from "pg"

const serverUrl = process.env.TEST_DATABASE_URL

if (!serverUrl && process.env.CI) {
  throw new Error("TEST_DATABASE_URL must be set in CI, or the Postgres tests would silently skip.")
}

/** Postgres suites run wherever TEST_DATABASE_URL is set, and CI always sets it. */
export const describeWithPostgres: jest.Describe = serverUrl ? describe : describe.skip

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
  readonly url: string
  /** For assertions on what is really stored, beneath the adapter. */
  query(sql: string): Promise<Record<string, unknown>[]>
  drop(): Promise<void>
}

/** A fresh, empty database per suite, so suites running in parallel never share tables. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `zulexgo_test_${randomBytes(6).toString("hex")}`
  const onServer = (sql: string) => connected(serverUrl!, (client) => client.query(sql))
  await onServer(`CREATE DATABASE ${name}`)

  const url = new URL(serverUrl!)
  url.pathname = `/${name}`

  return {
    url: url.toString(),
    query: (sql) => connected(url.toString(), async (client) => (await client.query(sql)).rows),
    drop: async () => {
      await onServer(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    },
  }
}
