import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { setupServer } from "msw/node"
import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { STORAGE_TEST_BUCKET, STORAGE_TEST_KEY, STORAGE_TEST_URL, SupabaseStorageDouble } from "@/tests/msw/supabase-storage"
import { Migrator, readMigrations } from "@/src/adapters/repository/postgres/migrator"
import { createTestDatabase, describeWithPostgres, type TestDatabase } from "@/src/adapters/repository/postgres/test-database"
import { clockContract } from "@/src/core/ports/clock.contract"
import { tokenGeneratorContract } from "@/src/core/ports/token-generator.contract"
import { submitCheckout } from "@/src/core/use-cases/submit-checkout"
import { ZULEX_BASE_URLS } from "./env"
import { createContainer } from "./container"

const dev = { APP_ENV: "dev" }
const staging = { APP_ENV: "staging", APP_BASE_URL: "https://zulexgo-staging.vercel.app", CRON_SECRET: "x" }

describe("createContainer", () => {
  it("boots a dev container from nothing but APP_ENV", () => {
    expect(createContainer(dev).env.APP_ENV).toBe("dev")
  })

  it("refuses to build a container for an invalid environment", () => {
    expect(() =>
      createContainer({
        APP_ENV: "staging",
        APP_BASE_URL: "https://zulexgo-staging.vercel.app",
        CRON_SECRET: "x",
        PAYMENT_DRIVER: "stripe",
        STRIPE_SECRET_KEY: "sk_live_placeholder",
        STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_placeholder",
      })
    ).toThrow(/STRIPE_SECRET_KEY/)
  })

  it("refuses a staging container pointed at the Zulex production host", () => {
    expect(() =>
      createContainer({
        APP_ENV: "staging",
        APP_BASE_URL: "https://zulexgo-staging.vercel.app",
        CRON_SECRET: "x",
        REGISTRATION_DRIVER: "zulex",
        ZULEX_BASE_URL: ZULEX_BASE_URLS.production,
        ZULEX_API_KEY: "k",
      })
    ).toThrow(/ZULEX_BASE_URL/)
  })
})

describe("container ports", () => {
  it("wires a fake for every port in dev, so the whole flow runs locally", async () => {
    const container = createContainer(dev)

    const { reference, clientSecret } = await submitCheckout(container, { request: FAKE_REQUEST, email: "customer@example.test" })

    expect(clientSecret).toEqual(expect.any(String))
    expect((await container.repository.get(reference))?.status).toBe("awaiting_payment")
    expect(await container.documents.list(reference)).toEqual([])
    expect((await container.identity.start({ reference, email: (await container.repository.get(reference))!.email })).link).toMatch(/^https:/)
  })

  it("builds status links on the stage's own origin", () => {
    expect(createContainer(staging).statusLink("t")).toBe("https://zulexgo-staging.vercel.app/status/t")
  })

  it.each([
    ["dev", dev, true],
    ["staging", staging, false],
  ] as const)("prints status tokens to the log only in dev (%s)", async (_, stage, printed) => {
    const log = jest.spyOn(console, "info").mockImplementation(() => {})
    const { reference, email } = anApplication()
    const statusLink = "https://zulexgo.example.test/status/faketoken-container-log-test-000000000001"

    await createContainer(stage).mailer.send({ to: email, template: { name: "orderConfirmation", reference, statusLink }, idempotencyKey: "k" })

    expect(log.mock.calls.flat().join("\n").includes("faketoken-container-log-test")).toBe(printed)
    log.mockRestore()
  })
})

describe("container documents on Supabase Storage", () => {
  const storage = new SupabaseStorageDouble()
  const server = setupServer(...storage.handlers)
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterAll(() => server.close())

  it("stores and lists documents in the configured bucket when STORAGE_DRIVER is supabase", async () => {
    const { documents } = createContainer({
      ...staging,
      STORAGE_DRIVER: "supabase",
      SUPABASE_STORAGE_URL: STORAGE_TEST_URL,
      SUPABASE_STORAGE_BUCKET: STORAGE_TEST_BUCKET,
      SUPABASE_STORAGE_SERVICE_KEY: STORAGE_TEST_KEY,
    })
    const { reference } = anApplication()

    await documents.put(reference, { id: "7", kind: "confirmation" }, new Uint8Array([1, 2, 3]))

    expect(await documents.list(reference)).toEqual([{ id: "7", kind: "confirmation" }])
  })
})

describe("container documents in dev", () => {
  it("serves the seeded confirmation of the completed application from the moment the server starts", async () => {
    const { repository, documents } = createContainer(dev)
    const completed = (await repository.findByStatusToken("seed-status-link-completed"))!

    expect(await documents.list(completed.reference)).toEqual([expect.objectContaining({ kind: "confirmation" })])
  })
})

describe("container repository", () => {
  it("serves the dev seed from the moment the server starts", async () => {
    const seeded = await createContainer(dev).repository.findByStatusToken("seed-status-link-completed")

    expect(seeded?.status).toBe("completed")
  })

  it("serves the same seed on staging when it runs on the in-memory repository", async () => {
    expect((await createContainer(staging).repository.findByStatusToken("seed-status-link-completed"))?.status).toBe("completed")
  })
})

describeWithPostgres("container repository on Postgres", () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = await createTestDatabase()
    await new Migrator(database.url, await readMigrations(join(process.cwd(), "db", "migrations"))).up()
  })
  afterAll(() => database.drop())

  it("stores applications in the database the environment names, readable by every server instance", async () => {
    const encryptionKey = randomBytes(32).toString("base64")
    const container = () =>
      createContainer({
        ...staging,
        REPOSITORY_DRIVER: "postgres",
        DATABASE_URL: database.url,
        DIRECT_DATABASE_URL: database.url,
        CODES_ENCRYPTION_KEY: encryptionKey,
      })
    const created = await container().repository.create(anApplication())

    expect((await container().repository.get(created.reference))?.status).toBe(created.status)
  })

  it("counts rate-limited attempts in that database too, so two instances share one count", async () => {
    const encryptionKey = randomBytes(32).toString("base64")
    const container = () =>
      createContainer({
        ...staging,
        REPOSITORY_DRIVER: "postgres",
        DATABASE_URL: database.url,
        DIRECT_DATABASE_URL: database.url,
        CODES_ENCRYPTION_KEY: encryptionKey,
      })
    const limit = { max: 1, windowMs: 60_000 }

    await container().rateLimiter.consume("container-test", limit)

    expect(await container().rateLimiter.consume("container-test", limit)).toMatchObject({ allowed: false })
  })
})

clockContract("container clock", () => createContainer(dev).clock)
tokenGeneratorContract("container tokens", () => createContainer(dev).tokens)
