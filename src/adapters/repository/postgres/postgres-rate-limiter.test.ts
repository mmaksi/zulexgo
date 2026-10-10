import { randomBytes } from "node:crypto"
import { join } from "node:path"
import type { Clock } from "@/src/core/ports/clock/clock"
import { rateLimiterContract } from "@/src/core/ports/rate-limit/rate-limiter.contract"
import { Migrator, readMigrations } from "./migrator"
import { PostgresRateLimiter } from "./postgres-rate-limiter"
import { createTestDatabase, describeWithPostgres, type TestDatabase } from "./test-database"

function movableClock() {
  let now = new Date("2026-03-01T09:00:00.000Z").getTime()
  const clock: Clock = { now: () => new Date(now) }
  return { clock, advance: (milliseconds: number) => (now += milliseconds) }
}

describeWithPostgres("PostgresRateLimiter", () => {
  let database: TestDatabase
  const secret = randomBytes(32).toString("base64")
  const limiter = (clock: Clock) => new PostgresRateLimiter({ connectionString: database.url, secret, clock })

  beforeAll(async () => {
    database = await createTestDatabase()
    await new Migrator(database.url, await readMigrations(join(process.cwd(), "db", "migrations"))).up()
  })
  beforeEach(() => database.query("TRUNCATE rate_limits"))
  afterAll(() => database.drop())

  rateLimiterContract("PostgresRateLimiter", () => {
    const { clock, advance } = movableClock()
    return { limiter: limiter(clock), advance }
  })

  it("counts across instances, as two Vercel functions must", async () => {
    const { clock } = movableClock()
    const [first, second] = [limiter(clock), limiter(clock)]
    const limit = { max: 3, windowMs: 60_000 }

    const decisions = []
    for (const instance of [first, second, first, second, first]) decisions.push((await instance.consume("shared", limit)).allowed)

    expect(decisions).toEqual([true, true, true, false, false])
  })

  it("stores a keyed hash of the key, never the key itself", async () => {
    await limiter(movableClock().clock).consume("resend:customer@example.test", { max: 3, windowMs: 60_000 })

    const stored = JSON.stringify(await database.query("SELECT * FROM rate_limits"))

    expect(stored).not.toContain("customer@example.test")
    expect(stored).not.toContain("resend")
  })

  it("hashes with its secret, so the same key under another secret is another row", async () => {
    const { clock } = movableClock()
    const other = new PostgresRateLimiter({ connectionString: database.url, secret: randomBytes(32).toString("base64"), clock })
    const limit = { max: 1, windowMs: 60_000 }
    await limiter(clock).consume("same-key", limit)

    expect((await other.consume("same-key", limit)).allowed).toBe(true)
  })

  it("forgets the counts of windows that ended long ago, so the table does not grow with every caller", async () => {
    await database.query("INSERT INTO rate_limits (key_hash, window_started_at, attempts) VALUES ('stale', '2026-02-26T09:00:00Z', 4), ('fresh', '2026-03-01T08:50:00Z', 1)")
    const { clock } = movableClock()

    await limiter(clock).consume("anyone", { max: 3, windowMs: 60_000 })

    expect((await database.query("SELECT key_hash FROM rate_limits WHERE key_hash IN ('stale', 'fresh')")).map((row) => row.key_hash)).toEqual(["fresh"])
  })
})
