import { APPLICATION_STATUSES } from "@/src/core/domain/application-status"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { loadSeed, seedFor } from "./seed"

describe("seedFor", () => {
  it("refuses to load in production", () => {
    expect(() => seedFor("production")).toThrow(/production/)
  })

  it.each(["dev", "staging"] as const)("loads in %s", (stage) => {
    expect(seedFor(stage).length).toBeGreaterThan(0)
  })

  it("seeds at least one application in every status, so every UI state is visible on boot", () => {
    const statuses = new Set(seedFor("dev").map(({ application }) => application.status))

    expect([...statuses].sort()).toEqual([...APPLICATION_STATUSES].sort())
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
})
