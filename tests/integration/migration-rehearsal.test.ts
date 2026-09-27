import { join } from "node:path"
import { Migrator, readMigrations } from "@/src/adapters/repository/postgres/migrator"
import { APPLICATION_STATUSES } from "@/src/core/domain/application-status"
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

    expect(migrated).toEqual(["application_status", "applications", "payments", "status_history", "status_tokens"])
    expect(reverted).toEqual([])
    expect(await schemaObjects()).toEqual(migrated)
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
  })
})
