import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { loadSeed, seedFor } from "@/db/seed/seed"
import { PostgresApplicationRepository } from "@/src/adapters/repository/postgres/postgres-application-repository"
import { Migrator, readMigrations } from "@/src/adapters/repository/postgres/migrator"
import { APPLICATION_STATUSES } from "@/src/core/domain/application/application-status"
import { SERVICES } from "@/src/core/domain/application/service"
import { createTestDatabase, describeWithPostgres, type TestDatabase } from "@/src/adapters/repository/postgres/test-database"

const SCHEMA_OBJECTS = `
  SELECT table_name AS name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
  UNION ALL
  SELECT domain_name FROM information_schema.domains WHERE domain_schema = 'public'
  ORDER BY name`

const TABLES_WITHOUT_RLS = `
  SELECT relname AS name FROM pg_class
   WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity`

const STATUS_DOMAIN_CHECK = `
  SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
   WHERE contypid = 'application_status'::regtype`

const SERVICE_CHECK = `
  SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
   WHERE conrelid = 'applications'::regclass AND conname = 'applications_service_known'`

/** The database-migrations skill's rehearsal: up, down, up must all succeed. */
describeWithPostgres("migration rehearsal", () => {
  let database: TestDatabase

  beforeAll(async () => {
    database = await createTestDatabase()
  })
  afterAll(() => database.drop())

  const schemaObjects = async () => (await database.query(SCHEMA_OBJECTS)).map((row) => row.name)

  it("applies every migration, reverts all of them without residue, and applies them again", async () => {
    const migrations = await readMigrations(join(process.cwd(), "db", "migrations"))
    const migrator = new Migrator(database.url, migrations)

    await migrator.up()
    const migrated = await schemaObjects()
    await migrator.down(migrations.length)
    const reverted = await schemaObjects()
    await migrator.up()

    expect(migrated).toEqual(["application_status", "applications", "payments", "rate_limits", "status_history", "status_tokens"])
    expect(reverted).toEqual([])
    expect(await schemaObjects()).toEqual(migrated)
  })

  // The claim every README makes ("safe on a live table"), proven on a table that holds an order written before Neuzulassung existed.
  it("applies the Neuzulassung migrations over a de-registration stored before them, leaving it as it was", async () => {
    const migrations = await readMigrations(join(process.cwd(), "db", "migrations"))
    const before = migrations.filter(({ name }) => name < "0010")
    // The test before this one leaves the schema fully migrated: start from nothing, so 0010 really is applied over the stored order.
    await new Migrator(database.url, migrations).down(migrations.length)
    await new Migrator(database.url, before).up()
    await database.query(`
      INSERT INTO applications (reference, version, status, email, plate_count, plate_prefix, plate_letters, plate_numbers, vin, encrypted_security_codes, authority_ikfz_status, idempotency_key)
      VALUES ('ZG-ABC123', 1, 'submitted_to_kba', 'old@example.test', 2, 'AAA', 'AA', '111', 'FAKEVIN0000000001', 'ciphertext', 'online', 'old-idempotency-key')`)

    await new Migrator(database.url, migrations).up()

    expect(await database.query("SELECT service, plate_prefix, encrypted_security_codes, encrypted_details, identity_verification_id FROM applications")).toEqual([
      { service: "deregistration", plate_prefix: "AAA", encrypted_security_codes: "ciphertext", encrypted_details: null, identity_verification_id: null },
    ])
    await new Migrator(database.url, migrations).down(migrations.length)
  })

  // The rehearsal that matters on a real table: the dev seed holds orders of both services when someone reverts.
  it("reverts the Neuzulassung migrations with orders stored, keeping the de-registrations, and loads the seed again afterwards", async () => {
    const migrations = await readMigrations(join(process.cwd(), "db", "migrations"))
    const migrator = new Migrator(database.url, migrations)
    await migrator.up()
    const repository = new PostgresApplicationRepository({ connectionString: database.url, encryptionKey: randomBytes(32).toString("base64") })
    const seed = seedFor("dev")
    const kept = seed.filter(({ application }) => application.request.service === "deregistration").length
    await loadSeed(repository, seed)

    await migrator.down(2)

    expect(await database.query("SELECT service, count(*)::int AS n FROM applications GROUP BY service")).toEqual([{ service: "deregistration", n: kept }])
    await migrator.up()
    expect(await loadSeed(repository, seed)).toBe(seed.length - kept)
    await migrator.down(migrations.length)
    await migrator.up()
  })

  describe("on the migrated schema", () => {
    beforeAll(async () => {
      await new Migrator(database.url, await readMigrations(join(process.cwd(), "db", "migrations"))).up()
    })

    it("turns on row-level security for every table, so nothing but the app can read one", async () => {
      expect(await database.query(TABLES_WITHOUT_RLS)).toEqual([])
    })

    it("allows exactly the statuses the status machine has, no more and no fewer", async () => {
      const [{ definition }] = await database.query(STATUS_DOMAIN_CHECK)
      const allowed = [...String(definition).matchAll(/'([a-z_]+)'/g)].map(([, status]) => status)

      expect(allowed.sort()).toEqual([...APPLICATION_STATUSES].sort())
    })

    it("allows exactly the services on the price list, no more and no fewer", async () => {
      const [{ definition }] = await database.query(SERVICE_CHECK)
      const allowed = [...String(definition).matchAll(/'([A-Za-z]+)'/g)].map(([, service]) => service)

      expect(allowed.sort()).toEqual([...SERVICES].sort())
    })
  })
})
