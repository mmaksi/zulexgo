import { join } from "node:path"
import { Migrator, readMigrations } from "@/src/adapters/repository/postgres/migrator"
import { createTestDatabase, describeWithPostgres, type TestDatabase } from "@/src/adapters/repository/postgres/test-database"

const SCHEMA_OBJECTS = `
  SELECT table_name AS name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name <> 'schema_migrations'
  UNION ALL
  SELECT domain_name FROM information_schema.domains WHERE domain_schema = 'public'
  ORDER BY name`

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
})
