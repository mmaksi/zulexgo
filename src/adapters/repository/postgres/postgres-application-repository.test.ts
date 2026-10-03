import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { applicationRepositoryContract } from "@/src/core/ports/repository/application-repository.contract"
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

  it.each([
    ["a code on a row with no failure kind", "failure_kind = NULL, failure_code = 5"],
    ["a code on a failure that has none", "failure_kind = 'rejected', failure_code = 5"],
    ["a KBA error without its code", "failure_kind = 'kbaError', failure_code = NULL"],
  ])("refuses %s, however the row is written", async (_, assignments) => {
    const created = await repository.create(anApplication())

    await expect(database.query(`UPDATE applications SET ${assignments} WHERE reference = '${created.reference}'`)).rejects.toThrow(/failure/)
  })

  describe("the service of an order", () => {
    const paidOrder = () => anApplication({ status: "submitted_to_kba", history: [{ status: "submitted_to_kba", at: new Date("2026-01-01T00:00:00.000Z") }] })

    it("is stored in a column of its own, where a query by service can find it", async () => {
      await repository.create(anApplication())

      expect(await database.query("SELECT service FROM applications")).toEqual([{ service: "deregistration" }])
    })

    it("does not make an open order of another service a duplicate", async () => {
      const created = await repository.create(paidOrder())
      expect(await repository.hasOpenApplication(created.request)).toBe(true)

      await database.query(`UPDATE applications SET service = 'newRegistration' WHERE reference = '${created.reference}'`)

      expect(await repository.hasOpenApplication(created.request)).toBe(false)
    })

    it("refuses a service the price list does not have, however the row is written", async () => {
      const created = await repository.create(anApplication())

      await expect(database.query(`UPDATE applications SET service = 'not-a-service' WHERE reference = '${created.reference}'`)).rejects.toThrow(/applications_service_known/)
    })
  })

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
