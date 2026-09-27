import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { applicationRepositoryContract } from "@/src/core/ports/application-repository.contract"
import { Migrator, readMigrations } from "./migrator"
import { PostgresApplicationRepository } from "./postgres-application-repository"
import { createTestDatabase, describeWithPostgres, type TestDatabase } from "./test-database"

const TOKEN = "faketoken-postgres-adapter-test-0000000001"

describeWithPostgres("PostgresApplicationRepository", () => {
  let database: TestDatabase
  let repository: PostgresApplicationRepository

  beforeAll(async () => {
    database = await createTestDatabase()
    await new Migrator(database.url, await readMigrations(join(process.cwd(), "db", "migrations"))).up()
    repository = new PostgresApplicationRepository({
      connectionString: database.url,
      encryptionKey: randomBytes(32).toString("base64"),
    })
  })
  beforeEach(() => database.query("TRUNCATE applications CASCADE"))
  afterAll(() => database.drop())

  applicationRepositoryContract("PostgresApplicationRepository", () => repository)

  it("keeps security codes and status tokens out of every stored row", async () => {
    const created = await repository.create(anApplication())
    await repository.setStatusToken(created.reference, TOKEN)

    const everything = JSON.stringify(
      await database.query(
        "SELECT (SELECT json_agg(a) FROM applications a) AS a, (SELECT json_agg(t) FROM status_tokens t) AS t",
      ),
    )

    for (const code of Object.values(FAKE_REQUEST.codes)) expect(everything).not.toContain(code)
    expect(everything).not.toContain(TOKEN)
  })
})
