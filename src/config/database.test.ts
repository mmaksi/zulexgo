import { randomBytes } from "node:crypto"
import { createTestDatabase, describeWithPostgres, type TestDatabase } from "@/src/adapters/repository/postgres/test-database"
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

  it.each([["drop"], [], ["down", "-1"]])("rejects the unknown command %p with its usage", async (...args) => {
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

  it("migrates over the direct connection and reports what ran", async () => {
    expect(await run("up")).toBe(
      ["0001_create_applications", "0002_create_payments", "0003_create_status_history", "0004_create_status_tokens"]
        .map((name) => `Applied ${name}`)
        .join("\n"),
    )
    expect(await run("up")).toBe("Nothing to apply.")
    expect(await run("status")).toMatch(/^applied .* 0001_create_applications$/m)
  })

  it("reverts one migration by default, or all of them", async () => {
    await run("up")

    expect(await run("down")).toBe("Reverted 0004_create_status_tokens")
    expect(await run("down", "all")).toBe(
      ["0003_create_status_history", "0002_create_payments", "0001_create_applications"].map((name) => `Reverted ${name}`).join("\n"),
    )
    expect(await run("status")).toMatch(/^pending 0001_create_applications$/m)
  })
})
