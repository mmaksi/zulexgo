import { anApplication, FAKE_REQUEST } from "@/tests/fixtures/applications"
import { applyEvent } from "@/src/core/domain/application"
import { APPLICATION_STATUSES } from "@/src/core/domain/application-status"
import { parseDeregistrationRequest } from "@/src/core/domain/deregistration-request"
import { DuplicateApplication } from "@/src/core/errors/duplicate-application"
import { StaleApplication } from "@/src/core/errors/stale-application"
import type { ApplicationRepository } from "./application-repository"

const NOW = new Date("2026-03-01T09:00:00.000Z")
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000)

/** Every ApplicationRepository adapter must pass this, including the fake. */
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
        expect(stored?.request.codes.certificate.reveal()).toBe(application.request.codes.certificate.reveal())
        expect(stored?.payment.total.equals(application.payment.total)).toBe(true)
      })

      it.each(APPLICATION_STATUSES)("stores an application in status %s", async (status) => {
        const created = await repository.create(anApplication({ status, history: [{ status, at: NOW }] }))

        expect((await repository.get(created.reference))?.status).toBe(status)
      })

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
        expect(stored?.request.codes.frontPlate).toBeUndefined()
        expect(stored?.request.codes.rearPlate.reveal()).toBe("AA1")
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

        expect((await repository.get(created.reference))?.request.codes.certificate.reveal()).toBe("AAAAAA9")
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
    })

    describe("findDueForPolling", () => {
      it("returns only applications whose KBA check or silent resubmission is due, soonest first, up to the limit", async () => {
        const atKba = (nextPollAt: Date) => anApplication({ status: "submitted_to_kba", polling: { nextPollAt, attempts: 1 } })
        const dueLater = await repository.create(atKba(minutes(-1)))
        const dueFirst = await repository.create(atKba(minutes(-10)))
        const resubmission = await repository.create(
          anApplication({ status: "submitted_and_paid", polling: { nextPollAt: minutes(-5), attempts: 0 } }),
        )
        const dueNow = await repository.create(atKba(NOW))
        await repository.create(atKba(minutes(5)))
        await repository.create(anApplication({ status: "completed", polling: { nextPollAt: minutes(-20), attempts: 3 } }))
        await repository.create(anApplication({ status: "submitted_to_kba", polling: { attempts: 0 } }))

        const due = await repository.findDueForPolling(NOW, 10)
        const firstTwo = await repository.findDueForPolling(NOW, 2)

        expect(due.map((application) => application.reference)).toEqual([
          dueFirst.reference,
          resubmission.reference,
          dueLater.reference,
          dueNow.reference,
        ])
        expect(firstTwo).toHaveLength(2)
      })
    })
  })
}
