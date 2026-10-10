import { APPLICATION_STATUSES, requiresIdentityVerification } from "@/src/core/domain/application/application-status"
import type { OrderableService } from "@/src/core/domain/application/service"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { InMemoryDocumentStore } from "@/src/adapters/storage/fake/in-memory-document-store"
import { anApplication } from "@/tests/fixtures/applications"
import { JOURNEYS, seededApplications } from "./data/applications"
import { FakePaymentProvider } from "@/src/adapters/payment/fake/fake-payment-provider"
import { retainedOf } from "@/src/core/domain/payment/refund-policy"
import { PROCESSING_FEE } from "@/src/core/domain/payment/pricing"
import { loadDocuments, loadSeed, seedDocumentsFor, seedFor, seedPaymentsFor } from "./seed"

describe("seedFor", () => {
  it("refuses to load in production", () => {
    expect(() => seedFor("production")).toThrow(/production/)
  })

  it.each(["dev", "staging"] as const)("loads in %s", (stage) => {
    expect(seedFor(stage).length).toBeGreaterThan(0)
  })

  it.each(Object.keys(JOURNEYS) as OrderableService[])(
    "seeds at least one %s in every status its journey passes through, so every UI state is visible on boot",
    (service) => {
      const identityStatuses = ["awaiting_identity_verification", "identity_verified"]
      const journey = requiresIdentityVerification(service) ? APPLICATION_STATUSES : APPLICATION_STATUSES.filter((status) => !identityStatuses.includes(status))
      const seeded = seedFor("dev").filter(({ application }) => application.request.service === service)

      expect(seeded.map(({ application }) => application.status).sort()).toEqual([...journey].sort())
    },
  )

  it("gives every seeded order a reference, status link, idempotency key and payment of its own", () => {
    const seed = seedFor("dev")

    for (const own of [
      ({ application }: (typeof seed)[number]) => application.reference,
      ({ statusToken }: (typeof seed)[number]) => statusToken,
      ({ application }: (typeof seed)[number]) => application.idempotencyKey,
      ({ application }: (typeof seed)[number]) => application.payment.id,
    ]) {
      expect(new Set(seed.map(own)).size).toBe(seed.length)
    }
  })

  it("records the identity verification of exactly the orders that reached status 2", () => {
    for (const { application } of seedFor("dev")) {
      const reachedStatus2 = application.history.some(({ status }) => status === "awaiting_identity_verification")

      expect(application.identityVerification !== undefined).toBe(reachedStatus2)
    }
  })

  it("is the same data on every boot", () => {
    expect(seedFor("dev")).toEqual(seedFor("dev"))
  })

  it("loads into the repository, each application reachable by its status link", async () => {
    const seed = seedFor("dev")
    const repository = new InMemoryApplicationRepository(seed)

    for (const { application, statusToken } of seed) {
      expect(await repository.findByStatusToken(statusToken)).toEqual({ ...application, version: 1 })
    }
  })

  it("loading it twice leaves one copy of each application", async () => {
    const seed = seedFor("dev")
    const repository = new InMemoryApplicationRepository([...seed, ...seed])

    for (const { application } of seed) {
      expect(await repository.get(application.reference)).toEqual({ ...application, version: 1 })
    }
    expect(await repository.findDueForPolling(new Date("2100-01-01"), 100)).toHaveLength(
      seed.filter(({ application }) => application.polling.nextPollAt).length,
    )
  })
})

describe("seedPaymentsFor", () => {
  const provider = () => new FakePaymentProvider({ now: () => new Date("2026-01-05T09:00:00.000Z") }, seedPaymentsFor("dev"))

  it("refuses to load in production", () => {
    expect(() => seedPaymentsFor("production")).toThrow(/production/)
  })

  it("gives every seeded application the payment its own record names, so the fake provider can answer for it", async () => {
    for (const { application } of seedFor("dev")) {
      expect((await provider().getPayment(application.payment.id)).amount).toEqual(application.payment.total)
    }
  })

  it.each(["failed_final", "cancelled"] as const)("shows %s as the fee kept and the rest returned, as the status page and email 6 read it", async (status) => {
    const { application } = seedFor("dev").find(({ application }) => application.status === status)!

    expect(retainedOf(await provider().getPayment(application.payment.id))).toEqual(PROCESSING_FEE)
  })

  it("shows an order still at the KBA, or waiting for a correction, as a held card, so cancelling it in dev works", async () => {
    for (const status of ["submitted_to_kba", "failed_correctable"] as const) {
      const { application } = seedFor("dev").find(({ application }) => application.status === status)!

      expect((await provider().getPayment(application.payment.id)).status).toBe("held")
    }
  })
})

describe("loadSeed", () => {
  it("adds what is missing, leaves what is there, and every status link works", async () => {
    const seed = seedFor("staging")
    const repository = new InMemoryApplicationRepository()

    expect(await loadSeed(repository, seed)).toBe(seed.length)
    expect(await loadSeed(repository, seed)).toBe(0)
    for (const { application, statusToken } of seed) {
      expect(await repository.findByStatusToken(statusToken)).toEqual({ ...application, version: 1 })
    }
  })

  it("keeps a seeded application someone has since changed, rather than resetting it", async () => {
    const [first] = seedFor("staging")
    const repository = new InMemoryApplicationRepository()
    await loadSeed(repository, [first])
    const changed = await repository.update({ ...(await repository.get(first.application.reference))!, retryAttempts: 1 })

    await loadSeed(repository, [first])

    expect(await repository.get(first.application.reference)).toEqual(changed)
  })

  it("survives a status added mid-journey: every application keeps its reference and its status link", async () => {
    const withoutPaid = (journeys: object) => Object.fromEntries(Object.entries(journeys).filter(([status]) => status !== "submitted_and_paid"))
    const repository = new InMemoryApplicationRepository()
    await loadSeed(repository, seededApplications({ deregistration: withoutPaid(JOURNEYS.deregistration), newRegistration: withoutPaid(JOURNEYS.newRegistration) }))

    const seed = seedFor("staging")
    await loadSeed(repository, seed)

    for (const { application, statusToken } of seed) {
      expect((await repository.findByStatusToken(statusToken))?.status).toBe(application.status)
    }
  })

  it("stops when a seeded idempotency key belongs to another order, rather than linking to the wrong one", async () => {
    const [first] = seedFor("staging")
    const repository = new InMemoryApplicationRepository()
    await repository.create(anApplication({ idempotencyKey: first.application.idempotencyKey }))

    await expect(loadSeed(repository, [first])).rejects.toThrow(/idempotencyKey/)
  })
})

describe("the seeded documents", () => {
  it("refuses to load in production, like the applications", () => {
    expect(() => seedDocumentsFor("production")).toThrow(/production/)
  })

  it("belong to seeded applications, and each completed one has its confirmation to download", () => {
    const applications = new Map(seedFor("dev").map(({ application }) => [application.reference, application.status]))
    const documents = seedDocumentsFor("dev")
    const completed = [...applications].filter(([, status]) => status === "completed").map(([reference]) => reference)

    for (const { reference } of documents) expect(applications.has(reference)).toBe(true)
    for (const reference of completed) {
      expect(documents.filter((document) => document.reference === reference && document.document.kind === "confirmation")).toHaveLength(1)
    }
  })

  it("are real PDFs, so the download opens in a viewer", () => {
    for (const { bytes } of seedDocumentsFor("dev")) expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-")
  })

  it("load once, and a rerun leaves them alone", async () => {
    const store = new InMemoryDocumentStore()
    const documents = seedDocumentsFor("staging")

    expect(await loadDocuments(store, documents)).toBe(documents.length)
    expect(await loadDocuments(store, documents)).toBe(0)
    for (const { reference, document } of documents) expect(await store.list(reference)).toEqual([document])
  })
})
