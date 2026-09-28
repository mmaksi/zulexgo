import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
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

    await createContainer(stage).mailer.send({ to: email, template: { name: "orderConfirmation", reference, statusLink } })

    expect(log.mock.calls.flat().join("\n").includes("faketoken-container-log-test")).toBe(printed)
    log.mockRestore()
  })

  it("refuses a driver whose real adapter does not exist yet, instead of quietly running a fake", () => {
    expect(() =>
      createContainer({
        ...staging,
        STORAGE_DRIVER: "supabase",
        SUPABASE_STORAGE_URL: "https://storage.example.test",
        SUPABASE_STORAGE_BUCKET: "documents",
        SUPABASE_STORAGE_SERVICE_KEY: "placeholder",
      }),
    ).toThrow(/STORAGE_DRIVER=supabase/)
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
})

clockContract("container clock", () => createContainer(dev).clock)
tokenGeneratorContract("container tokens", () => createContainer(dev).tokens)
