import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { aNewRegistrationApplication, anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION } from "@/tests/fixtures/new-registration"
import { loadSeed, seedFor } from "@/db/seed/seed"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
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
    it("is stored in a column of its own, where a query by service can find it", async () => {
      await repository.create(anApplication())
      await repository.create(aNewRegistrationApplication())

      expect(await database.query("SELECT service FROM applications ORDER BY service")).toEqual([{ service: "deregistration" }, { service: "newRegistration" }])
    })

    // Two checks refuse it (the list of services, and the columns each service must fill); Postgres reports the first it evaluates.
    it("refuses a service the price list does not have, however the row is written", async () => {
      const created = await repository.create(anApplication())

      await expect(database.query(`UPDATE applications SET service = 'not-a-service' WHERE reference = '${created.reference}'`)).rejects.toThrow(
        /applications_service_(known|columns)/,
      )
    })

    // Only two services have a request type to store, so a row of any other has nothing the adapter could read back.
    it("refuses a service that has no stored shape yet, however the row is written", async () => {
      const created = await repository.create(anApplication())

      await expect(database.query(`UPDATE applications SET service = 'reRegistration' WHERE reference = '${created.reference}'`)).rejects.toThrow(/applications_service_columns/)
    })
  })

  describe("the columns of each service", () => {
    it.each([
      ["a de-registration without its security codes", () => anApplication(), "encrypted_security_codes = NULL"],
      ["a de-registration without its plate", () => anApplication(), "plate_prefix = NULL"],
      ["a de-registration that carries a Neuzulassung's details", () => anApplication(), "encrypted_details = 'details'"],
      ["a Neuzulassung without its details", () => aNewRegistrationApplication(), "encrypted_details = NULL"],
      ["a Neuzulassung that carries a plate", () => aNewRegistrationApplication(), "plate_prefix = 'AAA', plate_letters = 'AA', plate_numbers = '1', plate_count = 1"],
      ["a Neuzulassung that carries security codes", () => aNewRegistrationApplication(), "encrypted_security_codes = 'codes'"],
    ])("refuses %s, however the row is written", async (_, order, assignments) => {
      const created = await repository.create(order())

      await expect(database.query(`UPDATE applications SET ${assignments} WHERE reference = '${created.reference}'`)).rejects.toThrow(/applications_service_columns/)
    })

    it.each([
      ["a verification id without its deadline", "identity_verification_id = 'verification-1'"],
      ["a verification deadline without its id", "identity_verification_deadline = now()"],
    ])("refuses %s", async (_, assignments) => {
      const created = await repository.create(aNewRegistrationApplication())

      await expect(database.query(`UPDATE applications SET ${assignments} WHERE reference = '${created.reference}'`)).rejects.toThrow(/applications_identity_verification_complete/)
    })
  })

  // What the plan's N3 asks for: a database reader (a dump, a support query, a leaked backup) learns nothing a person typed.
  it("keeps everything a Neuzulassung's customer typed out of every stored row, and the encrypted blob bound to its order", async () => {
    const created = await repository.create(aNewRegistrationApplication())
    const other = await repository.create(aNewRegistrationApplication())

    const everything = JSON.stringify(await database.query("SELECT (SELECT json_agg(a) FROM applications a) AS a"))
    const { owner, bankAccount, registrationCertificate, evbNumber, vin } = FAKE_NEW_REGISTRATION
    const typed = [
      evbNumber,
      registrationCertificate.number,
      registrationCertificate.securityCode,
      owner.firstName,
      owner.lastName,
      owner.birthDate,
      owner.birthPlace,
      owner.phone,
      owner.email,
      owner.address.street,
      owner.address.city,
      bankAccount.iban,
      bankAccount.bic,
      bankAccount.bankName,
    ]

    for (const value of typed) expect(everything).not.toContain(value)
    // The VIN is the one plain column the duplicate warning needs.
    expect(everything).toContain(vin)

    // Copied onto another order, the blob does not decrypt: it is bound to its own reference.
    await database.query(
      `UPDATE applications SET encrypted_details = (SELECT encrypted_details FROM applications WHERE reference = '${created.reference}') WHERE reference = '${other.reference}'`,
    )
    await expect(repository.get(other.reference)).rejects.toThrow()
  })

  // The provider's id is part of the customer's start link at some providers, so it is held like a token: encrypted, bound to its order.
  it("keeps the identity provider's verification id out of every stored row, and bound to its order", async () => {
    const waiting = await repository.create(
      aNewRegistrationApplication({
        status: "awaiting_identity_verification",
        history: [
          { status: "awaiting_payment", at: new Date("2026-03-01T09:00:00.000Z") },
          { status: "submitted_and_paid", at: new Date("2026-03-01T09:01:00.000Z") },
          { status: "awaiting_identity_verification", at: new Date("2026-03-01T09:02:00.000Z") },
        ],
        identityVerification: { id: "provider-verification-4711", deadline: new Date("2026-03-05T09:02:00.000Z"), reminderSent: false },
      }),
    )
    const other = await repository.create(aNewRegistrationApplication())

    const everything = JSON.stringify(await database.query("SELECT (SELECT json_agg(a) FROM applications a) AS a"))
    expect(everything).not.toContain("provider-verification-4711")
    expect((await repository.get(waiting.reference))?.identityVerification?.id).toBe("provider-verification-4711")

    // Copied onto another order, it does not decrypt.
    await database.query(
      `UPDATE applications SET identity_verification_id = (SELECT identity_verification_id FROM applications WHERE reference = '${waiting.reference}'),
         identity_verification_deadline = now() WHERE reference = '${other.reference}'`,
    )
    await expect(repository.get(other.reference)).rejects.toThrow()
  })

  // A keeper's age is checked when the details are entered, and a correction can enter them again after the order was placed.
  it("reads back an order whose keeper came of age after it was placed, as a correction made then leaves it", async () => {
    const placed = new Date("2026-03-01T09:00:00.000Z")
    const corrected = new Date("2026-03-02T09:00:00.000Z")
    const order = aNewRegistrationApplication({
      status: "submitted_and_paid",
      history: [
        { status: "awaiting_payment", at: placed },
        { status: "submitted_and_paid", at: corrected },
      ],
      // 17 on the day it was placed, 18 the day after.
      request: parseNewRegistrationRequest({ ...FAKE_NEW_REGISTRATION, owner: { ...FAKE_NEW_REGISTRATION.owner, birthDate: "2008-03-02" } }, corrected),
    })

    await repository.create(order)

    expect(await repository.get(order.reference)).toEqual({ ...order, version: 1 })
  })

  // What a staging deploy loads: every seeded order, of every service and status, must satisfy the schema and read back whole.
  it("stores the whole seed and reads every seeded order back as it was seeded", async () => {
    const seed = seedFor("staging")

    expect(await loadSeed(repository, seed)).toBe(seed.length)

    for (const { application, statusToken } of seed) {
      expect(await repository.findByStatusToken(statusToken)).toEqual({ ...application, version: 1 })
    }
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
