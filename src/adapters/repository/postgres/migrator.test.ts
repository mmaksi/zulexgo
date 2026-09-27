import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MigrationError, Migrator, readMigrations } from "./migrator"
import { createTestDatabase, describeWithPostgres, type TestDatabase } from "./test-database"

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "zulexgo-migrations-"))
})
afterEach(() => rm(directory, { recursive: true, force: true }))

async function addMigration(folder: string, files: Partial<Record<"up.sql" | "down.sql" | "README.md", string>> = {}) {
  const complete = { "up.sql": "SELECT 1;", "down.sql": "SELECT 1;", "README.md": "Why.", ...files }
  await mkdir(join(directory, folder))
  for (const [file, content] of Object.entries(complete)) await writeFile(join(directory, folder, file), content)
}

const table = (name: string) => ({
  "up.sql": `CREATE TABLE IF NOT EXISTS ${name} (id integer);`,
  "down.sql": `DROP TABLE IF EXISTS ${name};`,
})

describe("readMigrations", () => {
  it("reads every folder in version order, ignoring stray files", async () => {
    await addMigration("0002_second", { "up.sql": "SELECT 2;" })
    await addMigration("0001_first")
    await writeFile(join(directory, ".DS_Store"), "")

    const migrations = await readMigrations(directory)

    expect(migrations.map(({ version, name, up }) => ({ version, name, up }))).toEqual([
      { version: 1, name: "0001_first", up: "SELECT 1;" },
      { version: 2, name: "0002_second", up: "SELECT 2;" },
    ])
  })

  it("gives an edited migration a different checksum", async () => {
    await addMigration("0001_first")
    const before = await readMigrations(directory)
    await writeFile(join(directory, "0001_first", "down.sql"), "SELECT 2;")

    expect((await readMigrations(directory))[0].checksum).not.toBe(before[0].checksum)
  })

  it.each(["down.sql", "README.md"] as const)("rejects a migration without %s", async (file) => {
    await addMigration("0001_first")
    await rm(join(directory, "0001_first", file))

    await expect(readMigrations(directory)).rejects.toThrow(new RegExp(`0001_first.*${file}`))
  })

  it("rejects a folder whose name is not NNNN_snake_case", async () => {
    await addMigration("1_First-Table")

    await expect(readMigrations(directory)).rejects.toThrow(/1_First-Table/)
  })

  it.each([
    ["a gap", ["0001_first", "0003_third"]],
    ["a duplicate number", ["0001_first", "0001_again"]],
  ])("rejects %s in the sequence", async (_, folders) => {
    for (const folder of folders) await addMigration(folder)

    await expect(readMigrations(directory)).rejects.toThrow(MigrationError)
  })
})

describeWithPostgres("Migrator", () => {
  let database: TestDatabase

  beforeEach(async () => {
    database = await createTestDatabase()
  })
  afterEach(() => database.drop())

  const migrator = async () => new Migrator(database.url, await readMigrations(directory))

  const tables = async () =>
    (
      await database.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'schema_migrations' ORDER BY table_name",
      )
    ).map((row) => row.table_name)

  it("applies pending migrations in order, then nothing on a second run", async () => {
    await addMigration("0001_create_first", table("first"))
    await addMigration("0002_create_second", table("second"))

    const applied = await (await migrator()).up()
    const again = await (await migrator()).up()

    expect(applied.map((migration) => migration.name)).toEqual(["0001_create_first", "0002_create_second"])
    expect(again).toEqual([])
    expect(await tables()).toEqual(["first", "second"])
  })

  it("lets two deploys migrate at once: the second waits, then finds nothing left to apply", async () => {
    await addMigration("0001_create_slowly", { "up.sql": "SELECT pg_sleep(0.3); CREATE TABLE slow (id integer);" })

    const runs = await Promise.all([(await migrator()).up(), (await migrator()).up()])

    expect(runs.map((applied) => applied.length).sort()).toEqual([0, 1])
    expect(await tables()).toEqual(["slow"])
  })

  it("applies only the migrations added since the last run", async () => {
    await addMigration("0001_create_first", table("first"))
    await (await migrator()).up()
    await addMigration("0002_create_second", table("second"))

    const applied = await (await migrator()).up()

    expect(applied.map((migration) => migration.name)).toEqual(["0002_create_second"])
  })

  it("rolls back a failing migration completely and keeps the ones before it", async () => {
    await addMigration("0001_create_first", table("first"))
    await addMigration("0002_broken", { "up.sql": "CREATE TABLE half (id integer); SELECT no_such_column FROM half;" })

    await expect((await migrator()).up()).rejects.toThrow(/0002_broken/)

    expect(await tables()).toEqual(["first"])
    expect((await (await migrator()).status()).map(({ name, appliedAt }) => [name, Boolean(appliedAt)])).toEqual([
      ["0001_create_first", true],
      ["0002_broken", false],
    ])
  })

  it("refuses to run when a migration that already ran has been edited", async () => {
    await addMigration("0001_create_first", table("first"))
    await (await migrator()).up()
    await writeFile(join(directory, "0001_create_first", "up.sql"), "CREATE TABLE edited (id integer);")
    await addMigration("0002_create_second", table("second"))

    await expect((await migrator()).up()).rejects.toThrow(/0001_create_first.*changed/)
    expect(await tables()).toEqual(["first"])
  })

  it("reverts the latest migrations newest first, leaving the older ones", async () => {
    await addMigration("0001_create_first", table("first"))
    await addMigration("0002_create_second", table("second"))
    await addMigration("0003_create_third", table("third"))
    await (await migrator()).up()

    const reverted = await (await migrator()).down(2)

    expect(reverted.map((migration) => migration.name)).toEqual(["0003_create_third", "0002_create_second"])
    expect(await tables()).toEqual(["first"])
  })

  it("reverts nothing on a database that was never migrated", async () => {
    await addMigration("0001_create_first", table("first"))

    expect(await (await migrator()).down(1)).toEqual([])
  })
})
