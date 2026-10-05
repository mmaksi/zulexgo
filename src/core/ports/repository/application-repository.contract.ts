import {
  aNewRegistrationApplication,
  anApplication,
  FAKE_REQUEST,
  type DeregistrationApplication,
  type NewRegistrationApplication,
} from "@/tests/fixtures/applications"
import { FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW } from "@/tests/fixtures/new-registration"
import { applyEvent } from "@/src/core/domain/application/application"
import { APPLICATION_STATUSES } from "@/src/core/domain/application/application-status"
import { applyNewRegistrationCorrection } from "@/src/core/domain/application/new-registration-correction"
import type { Failure } from "@/src/core/domain/registration/failure"
import { parseDeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import { parseNewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import { DuplicateApplication } from "@/src/core/errors/application/duplicate-application"
import { StaleApplication } from "@/src/core/errors/application/stale-application"
import type { ApplicationRepository } from "./application-repository"

const NOW = new Date("2026-03-01T09:00:00.000Z")
// One of each Failure kind: only a kbaError carries a code, which Postgres keeps in its own column.
const FAILURES: Failure[] = [
  { kind: "unavailable" },
  { kind: "rejected" },
  { kind: "rejectionDocument" },
  { kind: "kbaError", code: 101 },
]
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000)

/**
 * Every ApplicationRepository adapter must pass this, including the fake.
 *
 * Pins down the port's guarantees: `create` stores version 1 and refuses a
 * reused reference or idempotency key; `update` is version-checked, so a stale
 * or never-created application is refused and nothing changes; security codes,
 * money and dates round-trip and what is returned is a copy; a status token is
 * found, read back, revoked by a newer one and never shared by two orders;
 * `hasOpenApplication` counts only paid, unfinished orders for the same service,
 * plate and VIN; `findDueForPolling` returns what is due, soonest first.
 *
 * `makeSubject` runs before every test and must hand back an empty store: a
 * fresh fake, or a database truncated beforehand.
 */
export function applicationRepositoryContract(name: string, makeSubject: () => ApplicationRepository) {
  describe(`ApplicationRepository contract: ${name}`, () => {
    let repository: ApplicationRepository
    beforeEach(() => {
      repository = makeSubject()
    })

    describe("create and get", () => {
      it("stores version 1 and returns it unchanged, codes and money included", async () => {
        const application = anApplication()

        const created = await repository.create(application)
        const stored = await repository.get(application.reference)

        expect(created.version).toBe(1)
        expect(stored).toEqual({ ...application, version: 1 })
        expect((stored as DeregistrationApplication).request.codes.certificate.reveal()).toBe(application.request.codes.certificate.reveal())
        expect(stored?.payment.total.equals(application.payment.total)).toBe(true)
      })

      // Postgres checks status against a domain mirroring this list, so a status added only in code
      // fails here.
      it.each(APPLICATION_STATUSES)("stores an application in status %s", async (status) => {
        const created = await repository.create(anApplication({ status, history: [{ status, at: NOW }] }))

        expect((await repository.get(created.reference))?.status).toBe(status)
      })

      it.each(APPLICATION_STATUSES)("stores a Neuzulassung order in status %s, with everything the customer entered", async (status) => {
        const order = aNewRegistrationApplication({ status, history: [{ status, at: NOW }] })

        const created = await repository.create(order)

        expect(await repository.get(created.reference)).toEqual({ ...order, version: 1 })
      })

      // Optional fields are nullable columns in Postgres: absent must come back absent, not null.
      it("round-trips a one-plate vehicle and every optional field", async () => {
        const application = anApplication({
          status: "submitted_to_kba",
          history: [
            { status: "awaiting_payment", at: minutes(-30) },
            { status: "submitted_and_paid", at: minutes(-20) },
            { status: "submitted_to_kba", at: minutes(-10) },
          ],
          request: parseDeregistrationRequest({
            ...FAKE_REQUEST,
            plateCount: 1,
            codes: { rearPlate: "AA1", certificate: "AAAAAA1" },
          }),
          ikfzStatus: "offline",
          zulexApplicationId: "fake-zulex-application-1",
          retryAttempts: 1,
          polling: { nextPollAt: minutes(5), attempts: 2 },
        })

        await repository.create(application)
        const stored = await repository.get(application.reference)

        expect(stored).toEqual({ ...application, version: 1 })
        expect((stored as DeregistrationApplication).request.codes.frontPlate).toBeUndefined()
        expect((stored as DeregistrationApplication).request.codes.rearPlate.reveal()).toBe("AA1")
      })

      // Launch plan D9: what the customer agreed to is kept with the order, with the version of each text.
      it("round-trips the consent given at checkout, a Neuzulassung's power of attorney included, and nothing for an order made before it was recorded", async () => {
        const deregistration = anApplication({ consent: { agbVersion: "2026-03", givenAt: minutes(-30) } })
        const newRegistration = aNewRegistrationApplication({ consent: { agbVersion: "2026-03", powerOfAttorneyVersion: "2026-04", givenAt: minutes(-30) } })
        const before = anApplication()

        for (const order of [deregistration, newRegistration, before]) await repository.create(order)

        expect((await repository.get(deregistration.reference))?.consent).toEqual({ agbVersion: "2026-03", givenAt: minutes(-30) })
        expect((await repository.get(deregistration.reference))?.consent).not.toHaveProperty("powerOfAttorneyVersion")
        expect((await repository.get(newRegistration.reference))?.consent).toEqual({ agbVersion: "2026-03", powerOfAttorneyVersion: "2026-04", givenAt: minutes(-30) })
        expect((await repository.get(before.reference))?.consent).toBeUndefined()
      })

      it("hands out the consent as a copy, so mutating its date never changes the store", async () => {
        const created = await repository.create(anApplication({ consent: { agbVersion: "2026-03", givenAt: minutes(-30) } }))
        const copy = (await repository.get(created.reference)) as unknown as { consent: { givenAt: Date } }

        copy.consent.givenAt.setFullYear(1999)

        expect((await repository.get(created.reference))?.consent?.givenAt).toEqual(minutes(-30))
      })

      it("returns undefined for an unknown reference", async () => {
        expect(await repository.get(anApplication().reference)).toBeUndefined()
      })

      it("rejects a reference that already exists", async () => {
        const first = await repository.create(anApplication())

        await expect(repository.create(anApplication({ reference: first.reference }))).rejects.toEqual(
          new DuplicateApplication("reference"),
        )
      })

      it("rejects an idempotency key that already exists", async () => {
        const first = await repository.create(anApplication())

        await expect(repository.create(anApplication({ idempotencyKey: first.idempotencyKey }))).rejects.toEqual(
          new DuplicateApplication("idempotencyKey"),
        )
      })

      // Matters for adapters that keep objects in memory; a database returns fresh ones per read.
      it("hands out copies, so mutating one never changes the store", async () => {
        const created = await repository.create(anApplication())
        const copy = (await repository.get(created.reference)) as unknown as { history: { at: Date }[]; status: string }

        copy.status = "completed"
        copy.history[0].at.setFullYear(1999)

        expect(await repository.get(created.reference)).toEqual(created)
      })
    })

    describe("update", () => {
      it("stores the change and bumps the version", async () => {
        const created = await repository.create(anApplication())

        const updated = await repository.update({ ...created, retryAttempts: 1 })

        expect(updated.version).toBe(2)
        expect(await repository.get(created.reference)).toEqual(updated)
      })

      it("keeps the consent through every update", async () => {
        const consent = { agbVersion: "2026-03", powerOfAttorneyVersion: "2026-04", givenAt: minutes(-30) }
        const created = await repository.create(aNewRegistrationApplication({ consent }))

        await repository.update({ ...created, status: "cancelled" })

        expect((await repository.get(created.reference))?.consent).toEqual(consent)
      })

      it("appends new status changes to the history, in order", async () => {
        const created = await repository.create(anApplication())
        const paid = applyEvent(created, "paymentConfirmed", minutes(1))
        const atKba = applyEvent(await repository.update(paid), "submittedToKba", minutes(2))

        await repository.update(atKba)

        expect((await repository.get(created.reference))?.history).toEqual([
          ...created.history,
          { status: "submitted_and_paid", at: minutes(1) },
          { status: "submitted_to_kba", at: minutes(2) },
        ])
      })

      it("stores changed security codes, as a correction resubmits them", async () => {
        const created = await repository.create(anApplication())
        const corrected = parseDeregistrationRequest({ ...FAKE_REQUEST, codes: { ...FAKE_REQUEST.codes, certificate: "AAAAAA9" } })

        await repository.update({ ...created, request: corrected })

        expect(((await repository.get(created.reference)) as DeregistrationApplication).request.codes.certificate.reveal()).toBe("AAAAAA9")
      })

      it.each(FAILURES)("stores why an application failed: %j", async (failure) => {
        const created = await repository.create(anApplication())

        await repository.update({ ...created, status: "failed_correctable", failure })

        expect((await repository.get(created.reference))?.failure).toEqual(failure)
      })

      it("forgets the failure once an update clears it, as a correction does", async () => {
        const created = await repository.create(anApplication())
        const failed = await repository.update({ ...created, failure: { kind: "kbaError", code: 101 } })

        await repository.update({ ...failed, failure: undefined })

        expect((await repository.get(created.reference))?.failure).toBeUndefined()
      })

      it("stores a replaced idempotency key, as a correction that files the order afresh does", async () => {
        const created = await repository.create(anApplication())

        await repository.update({ ...created, idempotencyKey: "fresh-key-after-a-correction" })

        expect((await repository.get(created.reference))?.idempotencyKey).toBe("fresh-key-after-a-correction")
      })

      it("rejects an update that takes an idempotency key another order holds, and keeps what is stored", async () => {
        const first = await repository.create(anApplication())
        const second = await repository.create(anApplication())

        await expect(repository.update({ ...second, idempotencyKey: first.idempotencyKey })).rejects.toEqual(
          new DuplicateApplication("idempotencyKey"),
        )
        expect((await repository.get(second.reference))?.idempotencyKey).toBe(second.idempotencyKey)
      })

      it("rejects a stale version and keeps what is stored, so two writers cannot both win", async () => {
        const created = await repository.create(anApplication())
        await repository.update({ ...created, retryAttempts: 1 })

        await expect(repository.update({ ...created, status: "cancelled" })).rejects.toBeInstanceOf(StaleApplication)
        expect((await repository.get(created.reference))?.retryAttempts).toBe(1)
      })

      it("rejects an application that was never created", async () => {
        await expect(repository.update(anApplication({ version: 1 }))).rejects.toBeInstanceOf(StaleApplication)
      })
    })

    describe("a Neuzulassung order", () => {
      const request = (overrides: object) => parseNewRegistrationRequest({ ...FAKE_NEW_REGISTRATION, ...overrides }, FAKE_NEW_REGISTRATION_NOW)

      // Optional parts are absent or nullable in storage: absent must come back absent, never null or empty.
      it("round-trips the optional parts: a seasonal E-plate, the engine, a verification in progress", async () => {
        const order = aNewRegistrationApplication({
          status: "awaiting_identity_verification",
          history: [
            { status: "awaiting_payment", at: minutes(-30) },
            { status: "submitted_and_paid", at: minutes(-20) },
            { status: "awaiting_identity_verification", at: minutes(-10) },
          ],
          request: request({ engineType: "electric", plate: { electric: true, seasonal: { from: 4, until: 10 } } }),
          identityVerification: { id: "verification-1", deadline: minutes(4 * 24 * 60), reminderSent: false },
          polling: { nextPollAt: minutes(5), attempts: 0 },
        })

        await repository.create(order)
        const stored = (await repository.get(order.reference)) as NewRegistrationApplication

        expect(stored).toEqual({ ...order, version: 1 })
        expect(stored.request.plate).toEqual({ electric: true, seasonal: { from: 4, until: 10 } })
        expect(stored.identityVerification).toEqual({ id: "verification-1", deadline: minutes(4 * 24 * 60), reminderSent: false })
      })

      it("returns the secrets as they were entered, and nothing where there was none", async () => {
        const order = await repository.create(aNewRegistrationApplication())
        const { request: stored, identityVerification } = (await repository.get(order.reference)) as NewRegistrationApplication

        expect(stored.vin).toBe(FAKE_NEW_REGISTRATION.vin)
        expect(stored.evbNumber.reveal()).toBe(FAKE_NEW_REGISTRATION.evbNumber)
        expect(stored.registrationCertificate.securityCode.reveal()).toBe(FAKE_NEW_REGISTRATION.registrationCertificate.securityCode)
        expect(stored.owner.birthDate.reveal()).toBe(FAKE_NEW_REGISTRATION.owner.birthDate)
        expect(stored.owner.address.reveal()).toEqual(FAKE_NEW_REGISTRATION.owner.address)
        expect(stored.bankAccount.reveal()).toEqual({ ...FAKE_NEW_REGISTRATION.bankAccount, country: "DE" })
        expect(stored.plate.seasonal).toBeUndefined()
        expect(identityVerification).toBeUndefined()
      })

      it("stores a correction of the eVB number and the Teil II code, as one that is patched or refiled does", async () => {
        const created = (await repository.create(aNewRegistrationApplication({ status: "failed_correctable" }))) as NewRegistrationApplication
        const corrected = applyNewRegistrationCorrection(created.request, {
          evbNumber: request({ evbNumber: "FAKEEV9" }).evbNumber,
          part2SecurityCode: request({ registrationCertificate: { number: "FAKE0001", securityCode: "OTHERCODE" } }).registrationCertificate.securityCode,
        })

        await repository.update({ ...created, request: corrected })
        const stored = (await repository.get(created.reference)) as NewRegistrationApplication

        expect(stored.request.evbNumber.reveal()).toBe("FAKEEV9")
        expect(stored.request.registrationCertificate.securityCode.reveal()).toBe("OTHERCODE")
        expect(stored.request.owner).toEqual(created.request.owner)
      })

      it("stores a corrected owner name and birth date, as a correction after an identity mismatch does, and the rest of the owner as it was", async () => {
        const created = (await repository.create(aNewRegistrationApplication({ status: "failed_correctable" }))) as NewRegistrationApplication
        const owner = request({ owner: { ...FAKE_NEW_REGISTRATION.owner, firstName: "Erik", birthDate: "1990-05-18" } }).owner
        const corrected = applyNewRegistrationCorrection(created.request, { firstName: owner.firstName, birthDate: owner.birthDate })

        await repository.update({ ...created, request: corrected })
        const stored = ((await repository.get(created.reference)) as NewRegistrationApplication).request

        expect(stored.owner.firstName).toBe("Erik")
        expect(stored.owner.birthDate.reveal()).toBe("1990-05-18")
        expect(stored.owner.lastName).toBe(created.request.owner.lastName)
        expect(stored.owner.address.reveal()).toEqual(created.request.owner.address.reveal())
      })

      it("stores the verification the order starts waiting on, and keeps it while the order moves on", async () => {
        const paid = await repository.create(aNewRegistrationApplication({ status: "submitted_and_paid" }))
        const waiting = await repository.update({
          ...applyEvent(paid, "identityVerificationStarted", minutes(1)),
          identityVerification: { id: "verification-2", deadline: minutes(100), reminderSent: false },
        })

        const verified = await repository.update(applyEvent(waiting, "identityVerified", minutes(2)))

        expect(verified.status).toBe("identity_verified")
        expect(verified.identityVerification).toEqual({ id: "verification-2", deadline: minutes(100), reminderSent: false })
      })

      it("remembers that the reminder was sent, so the customer is reminded once however often the order is polled", async () => {
        const paid = await repository.create(aNewRegistrationApplication({ status: "submitted_and_paid" }))
        const waiting = await repository.update({
          ...applyEvent(paid, "identityVerificationStarted", minutes(1)),
          identityVerification: { id: "verification-3", deadline: minutes(100), reminderSent: false },
        })

        const reminded = await repository.update({ ...waiting, identityVerification: { ...waiting.identityVerification!, reminderSent: true } })

        expect(waiting.identityVerification?.reminderSent).toBe(false)
        expect((await repository.get(reminded.reference))?.identityVerification).toEqual({ id: "verification-3", deadline: minutes(100), reminderSent: true })
      })

      it("hands out copies, so mutating one never changes the store", async () => {
        const created = await repository.create(
          aNewRegistrationApplication({ request: request({ plate: { electric: false, seasonal: { from: 3, until: 9 } } }) }),
        )
        const copy = (await repository.get(created.reference)) as unknown as NewRegistrationApplication & {
          request: { plate: { seasonal: { from: number } }; owner: { firstName: string }; registrationCertificate: { number: string } }
        }

        copy.request.plate.seasonal.from = 1
        copy.request.owner.firstName = "Changed"
        copy.request.registrationCertificate.number = "CHANGED"

        // Literals, not `created`: a part the store failed to copy would be shared with it too, and the two would still agree.
        const { request: stored } = (await repository.get(created.reference)) as NewRegistrationApplication
        expect(stored.plate.seasonal).toEqual({ from: 3, until: 9 })
        expect(stored.owner.firstName).toBe(FAKE_NEW_REGISTRATION.owner.firstName)
        expect(stored.registrationCertificate.number).toBe(FAKE_NEW_REGISTRATION.registrationCertificate.number)
      })

      it("is found by its status token, like any order", async () => {
        const created = await repository.create(aNewRegistrationApplication())

        await repository.setStatusToken(created.reference, "token-for-contract-test-000000000000000000a")

        expect(await repository.findByStatusToken("token-for-contract-test-000000000000000000a")).toEqual(created)
      })
    })

    describe("status tokens", () => {
      it("finds an application by its token", async () => {
        const created = await repository.create(anApplication())

        await repository.setStatusToken(created.reference, "token-for-contract-test-000000000000000000a")

        expect(await repository.findByStatusToken("token-for-contract-test-000000000000000000a")).toEqual(created)
      })

      it("revokes the old token when a new one is set", async () => {
        const created = await repository.create(anApplication())
        await repository.setStatusToken(created.reference, "token-for-contract-test-000000000000000000a")

        await repository.setStatusToken(created.reference, "token-for-contract-test-000000000000000000b")

        expect(await repository.findByStatusToken("token-for-contract-test-000000000000000000a")).toBeUndefined()
        expect(await repository.findByStatusToken("token-for-contract-test-000000000000000000b")).toEqual(created)
      })

      it("reads back the current token, so later emails can carry the same status link", async () => {
        const created = await repository.create(anApplication())
        await repository.setStatusToken(created.reference, "token-for-contract-test-000000000000000000a")
        await repository.setStatusToken(created.reference, "token-for-contract-test-000000000000000000b")

        expect(await repository.getStatusToken(created.reference)).toBe("token-for-contract-test-000000000000000000b")
        expect(await repository.getStatusToken(anApplication().reference)).toBeUndefined()
      })

      it("finds nothing for an unknown token", async () => {
        expect(await repository.findByStatusToken("token-for-contract-test-00000000000000000000")).toBeUndefined()
      })

      it("refuses a token for an application that does not exist", async () => {
        const missing = anApplication().reference

        await expect(repository.setStatusToken(missing, "token-for-contract-test-000000000000000000a")).rejects.toThrow()
        expect(await repository.findByStatusToken("token-for-contract-test-000000000000000000a")).toBeUndefined()
      })

      it("refuses a token another application holds, so one link never opens two orders", async () => {
        const holder = await repository.create(anApplication())
        const other = await repository.create(anApplication())
        await repository.setStatusToken(holder.reference, "token-for-contract-test-000000000000000000a")

        await expect(repository.setStatusToken(other.reference, "token-for-contract-test-000000000000000000a")).rejects.toThrow()
        expect(await repository.findByStatusToken("token-for-contract-test-000000000000000000a")).toEqual(holder)
      })
    })

    describe("hasOpenApplication", () => {
      const vehicle = { service: "deregistration" as const, licencePlate: FAKE_REQUEST.licencePlate, vin: parseDeregistrationRequest(FAKE_REQUEST).vin }
      const otherVehicle = (overrides: object) => parseDeregistrationRequest({ ...FAKE_REQUEST, ...overrides })

      it.each(["submitted_and_paid", "submitted_to_kba", "failed_correctable"] as const)(
        "finds a paid order for the same plate and VIN that is still %s",
        async (status) => {
          await repository.create(anApplication({ status, history: [{ status, at: NOW }] }))

          expect(await repository.hasOpenApplication(vehicle)).toBe(true)
        },
      )

      it.each(["awaiting_payment", "completed", "failed_final", "cancelled"] as const)(
        "does not count an order that is %s: nothing is unpaid or unfinished about it",
        async (status) => {
          await repository.create(anApplication({ status, history: [{ status, at: NOW }] }))

          expect(await repository.hasOpenApplication(vehicle)).toBe(false)
        },
      )

      it("needs the plate and the VIN both to match", async () => {
        await repository.create(anApplication({ status: "submitted_to_kba", history: [{ status: "submitted_to_kba", at: NOW }] }))

        expect(await repository.hasOpenApplication({ ...vehicle, vin: otherVehicle({ vin: "FAKEVIN0000000002" }).vin })).toBe(false)
        expect(
          await repository.hasOpenApplication({ ...vehicle, licencePlate: { ...vehicle.licencePlate, numbers: "222" } }),
        ).toBe(false)
      })

      it("finds nothing when there are no orders", async () => {
        expect(await repository.hasOpenApplication(vehicle)).toBe(false)
      })

      describe("for a Neuzulassung, where the VIN alone says which car", () => {
        const parsed = parseNewRegistrationRequest(FAKE_NEW_REGISTRATION, FAKE_NEW_REGISTRATION_NOW)
        const car = { service: parsed.service, vin: parsed.vin }

        it.each(["submitted_and_paid", "awaiting_identity_verification", "identity_verified", "submitted_to_kba", "failed_correctable"] as const)(
          "finds a paid order for the same VIN that is still %s",
          async (status) => {
            await repository.create(aNewRegistrationApplication({ status, history: [{ status, at: NOW }] }))

            expect(await repository.hasOpenApplication(car)).toBe(true)
          },
        )

        it.each(["awaiting_payment", "completed", "failed_final", "cancelled"] as const)("does not count an order that is %s", async (status) => {
          await repository.create(aNewRegistrationApplication({ status, history: [{ status, at: NOW }] }))

          expect(await repository.hasOpenApplication(car)).toBe(false)
        })

        it("does not match another VIN", async () => {
          await repository.create(aNewRegistrationApplication({ status: "submitted_to_kba" }))

          const other = parseNewRegistrationRequest({ ...FAKE_NEW_REGISTRATION, vin: "FAKEVIN0000000003" }, FAKE_NEW_REGISTRATION_NOW)

          expect(await repository.hasOpenApplication({ service: other.service, vin: other.vin })).toBe(false)
        })

        it("is not an open de-registration of the same VIN, nor the other way round", async () => {
          const deregistration = parseDeregistrationRequest({ ...FAKE_REQUEST, vin: car.vin })
          const asDeregistration = { service: "deregistration" as const, licencePlate: deregistration.licencePlate, vin: deregistration.vin }

          await repository.create(aNewRegistrationApplication({ status: "submitted_to_kba" }))
          expect(await repository.hasOpenApplication(asDeregistration)).toBe(false)

          await repository.create(anApplication({ status: "submitted_to_kba", request: deregistration }))
          expect(await repository.hasOpenApplication(asDeregistration)).toBe(true)
        })

        it("is not found by a de-registration alone", async () => {
          await repository.create(anApplication({ status: "submitted_to_kba", request: parseDeregistrationRequest({ ...FAKE_REQUEST, vin: car.vin }) }))

          expect(await repository.hasOpenApplication(car)).toBe(false)
        })
      })
    })

    // Due includes a moment exactly at `now`; an application with no nextPollAt (no longer
    // watched) is never due.
    describe("findDueForPolling", () => {
      it("returns only applications whose KBA check, silent resubmission or hold check (a 5b waiting on the customer) is due, soonest first, up to the limit", async () => {
        const atKba = (nextPollAt: Date) => anApplication({ status: "submitted_to_kba", polling: { nextPollAt, attempts: 1 } })
        const dueLater = await repository.create(atKba(minutes(-1)))
        const dueFirst = await repository.create(atKba(minutes(-10)))
        const resubmission = await repository.create(
          anApplication({ status: "submitted_and_paid", polling: { nextPollAt: minutes(-5), attempts: 0 } }),
        )
        const dueNow = await repository.create(atKba(NOW))
        const waitingOnCustomer = await repository.create(
          anApplication({ status: "failed_correctable", polling: { nextPollAt: minutes(-3), attempts: 1 } }),
        )
        await repository.create(atKba(minutes(5)))
        await repository.create(anApplication({ status: "completed", polling: { nextPollAt: minutes(-20), attempts: 3 } }))
        await repository.create(anApplication({ status: "submitted_to_kba", polling: { attempts: 0 } }))

        const due = await repository.findDueForPolling(NOW, 10)
        const firstTwo = await repository.findDueForPolling(NOW, 2)

        expect(due.map((application) => application.reference)).toEqual([
          dueFirst.reference,
          resubmission.reference,
          waitingOnCustomer.reference,
          dueLater.reference,
          dueNow.reference,
        ])
        expect(firstTwo).toHaveLength(2)
      })

      it("returns a Neuzulassung order that waits for its verification or is verified and not yet filed, when due", async () => {
        const waiting = await repository.create(
          aNewRegistrationApplication({ status: "awaiting_identity_verification", polling: { nextPollAt: minutes(-2), attempts: 0 } }),
        )
        const verified = await repository.create(
          aNewRegistrationApplication({ status: "identity_verified", polling: { nextPollAt: minutes(-1), attempts: 0 } }),
        )
        await repository.create(aNewRegistrationApplication({ status: "awaiting_identity_verification", polling: { nextPollAt: minutes(9), attempts: 0 } }))

        const due = await repository.findDueForPolling(NOW, 10)

        expect(due.map(({ reference }) => reference)).toEqual([waiting.reference, verified.reference])
        expect(due[0]).toEqual(waiting)
      })
    })
  })
}
