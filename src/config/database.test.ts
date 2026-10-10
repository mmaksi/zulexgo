import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { readMigrations } from "@/src/adapters/repository/postgres/migrator"
import { createTestDatabase, describeWithPostgres, type TestDatabase } from "@/src/adapters/repository/postgres/test-database"
import { SEEDED_APPLICATIONS } from "@/db/seed/data/applications"
import { SEEDED_DOCUMENTS } from "@/db/seed/data/documents"
import { setupServer } from "msw/node"
import { STORAGE_TEST_BUCKET, STORAGE_TEST_KEY, STORAGE_TEST_URL, SupabaseStorageDouble } from "@/tests/msw/supabase-storage"
import { runDatabaseCommand } from "./database"

const UNREACHABLE = "postgres://nobody:nothing@127.0.0.1:1/none"

const onPostgres = (overrides: Record<string, string>) => ({
  APP_ENV: "dev",
  REPOSITORY_DRIVER: "postgres",
  DATABASE_URL: UNREACHABLE,
  DIRECT_DATABASE_URL: UNREACHABLE,
  CODES_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  ...overrides,
})

const staging = { APP_ENV: "staging", APP_BASE_URL: "https://zulexgo-staging.vercel.app", CRON_SECRET: "x" }

describe("runDatabaseCommand", () => {
  it("refuses to run without a database, naming the driver", async () => {
    await expect(runDatabaseCommand(["up"], { APP_ENV: "dev" })).rejects.toThrow(/REPOSITORY_DRIVER/)
  })

  it("refuses to revert migrations outside dev", async () => {
    await expect(runDatabaseCommand(["down"], onPostgres(staging))).rejects.toThrow(/only in dev, not staging/)
  })

  it("refuses to seed without a database, naming the driver", async () => {
    await expect(runDatabaseCommand(["seed"], { APP_ENV: "dev" })).rejects.toThrow(/REPOSITORY_DRIVER/)
  })

  it("refuses to re-encrypt without the current key, naming it", async () => {
    await expect(runDatabaseCommand(["reencrypt"], { DIRECT_DATABASE_URL: UNREACHABLE })).rejects.toThrow(/CODES_ENCRYPTION_KEY/)
  })

  it.each([["drop"], [], ["down", "-1"], ["seed", "1"]])("rejects the unknown command %p with its usage", async (...args) => {
    await expect(runDatabaseCommand(args, onPostgres({}))).rejects.toThrow(/Usage/)
  })
})

describeWithPostgres("runDatabaseCommand on a database", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })
  afterEach(() => database.drop())

  const run = (...args: string[]) => runDatabaseCommand(args, onPostgres({ DIRECT_DATABASE_URL: database.url }))

  const migrationNames = async () => (await readMigrations(join(process.cwd(), "db", "migrations"))).map(({ name }) => name)

  it("migrates over the direct connection and reports what ran", async () => {
    expect(await run("up")).toBe((await migrationNames()).map((name) => `Applied ${name}`).join("\n"))
    expect(await run("up")).toBe("Nothing to apply.")
    expect(await run("status")).toMatch(/^applied .* 0001_create_applications$/m)
  })

  it("seeds a migrated database once, however often it runs, so a staging redeploy adds nothing twice", async () => {
    await run("up")

    const n = SEEDED_APPLICATIONS.length

    expect(await run("seed")).toBe(`Seeded ${n} applications.`)
    expect(await run("seed")).toBe("Seed already loaded.")
    expect(await database.query("SELECT count(*)::int AS n FROM applications")).toEqual([{ n }])
    expect(await database.query("SELECT count(*)::int AS n FROM status_tokens")).toEqual([{ n }])
  })

  it("re-encrypts everything a retired key wrote under the current key, so the retired one can go", async () => {
    const [retired, current] = [randomBytes(32).toString("base64"), randomBytes(32).toString("base64")]
    const withKeys = (keys: Record<string, string>) => onPostgres({ DIRECT_DATABASE_URL: database.url, ...keys })
    await run("up")
    await runDatabaseCommand(["seed"], withKeys({ CODES_ENCRYPTION_KEY: retired }))

    const [{ n }] = await database.query(
      `SELECT (SELECT count(encrypted_security_codes) + count(encrypted_details) + count(identity_verification_id) FROM applications)
            + (SELECT count(*) FROM status_tokens) AS n`,
    )
    expect(await runDatabaseCommand(["reencrypt"], withKeys({ CODES_ENCRYPTION_KEY: current, RETIRED_CODES_ENCRYPTION_KEYS: retired }))).toBe(
      `Re-encrypted ${n} values under the current key.`,
    )
    await expect(runDatabaseCommand(["reencrypt"], withKeys({ CODES_ENCRYPTION_KEY: current }))).resolves.toMatch(/^Re-encrypted/)
    await expect(runDatabaseCommand(["reencrypt"], withKeys({ CODES_ENCRYPTION_KEY: retired }))).rejects.toThrow()
  })

  it("re-encrypts with nothing but the database's address and the keys, whatever the stage, so it runs from any shell", async () => {
    await run("up")

    expect(await runDatabaseCommand(["reencrypt"], { APP_ENV: "production", DIRECT_DATABASE_URL: database.url, CODES_ENCRYPTION_KEY: randomBytes(32).toString("base64") })).toBe(
      "Re-encrypted 0 values under the current key.",
    )
  })

  it("reverts one migration by default, or all of them", async () => {
    await run("up")
    const [newest, ...older] = (await migrationNames()).reverse()

    expect(await run("down")).toBe(`Reverted ${newest}`)
    expect(await run("down", "all")).toBe(older.map((name) => `Reverted ${name}`).join("\n"))
    expect(await run("status")).toMatch(/^pending 0001_create_applications$/m)
  })

  describe("seeding the documents", () => {
    const storage = new SupabaseStorageDouble()
    const server = setupServer(...storage.handlers)
    beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
    beforeEach(() => storage.objects.clear())
    afterAll(() => server.close())

    const runWithStorage = () =>
      runDatabaseCommand(
        ["seed"],
        onPostgres({
          DIRECT_DATABASE_URL: database.url,
          STORAGE_DRIVER: "supabase",
          SUPABASE_STORAGE_URL: STORAGE_TEST_URL,
          SUPABASE_STORAGE_BUCKET: STORAGE_TEST_BUCKET,
          SUPABASE_STORAGE_SERVICE_KEY: STORAGE_TEST_KEY,
        }),
      )

    it("puts them in the bucket beside the applications, once, however often it runs", async () => {
      await run("up")

      const first = await runWithStorage()
      const second = await runWithStorage()

      expect(first).toContain(`Seeded ${SEEDED_APPLICATIONS.length} applications.`)
      expect(first).toContain(`Seeded ${SEEDED_DOCUMENTS.length} documents.`)
      expect(second).toBe("Seed already loaded.")
      expect(storage.objects.size).toBe(SEEDED_DOCUMENTS.length)
    })
  })
})
