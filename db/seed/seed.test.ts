import { APPLICATION_STATUSES } from "@/src/core/domain/application-status"
import { InMemoryApplicationRepository } from "@/src/adapters/repository/fake/in-memory-application-repository"
import { devSeed } from "./seed"

describe("devSeed", () => {
  it.each(["staging", "production"] as const)("refuses to load when APP_ENV is %s", (stage) => {
    expect(() => devSeed(stage)).toThrow(/dev/)
  })

  it("seeds at least one application in every status, so every UI state is visible on boot", () => {
    const statuses = new Set(devSeed("dev").map(({ application }) => application.status))

    expect([...statuses].sort()).toEqual([...APPLICATION_STATUSES].sort())
  })

  it("is the same data on every boot", () => {
    expect(devSeed("dev")).toEqual(devSeed("dev"))
  })

  it("loads into the repository, each application reachable by its status link", async () => {
    const seed = devSeed("dev")
    const repository = new InMemoryApplicationRepository(seed)

    for (const { application, statusToken } of seed) {
      expect(await repository.findByStatusToken(statusToken)).toEqual({ ...application, version: 1 })
    }
  })

  it("loading it twice leaves one copy of each application", async () => {
    const seed = devSeed("dev")
    const repository = new InMemoryApplicationRepository([...seed, ...seed])

    for (const { application } of seed) {
      expect(await repository.get(application.reference)).toEqual({ ...application, version: 1 })
    }
    expect(await repository.findDueForPolling(new Date("2100-01-01"), 100)).toHaveLength(
      seed.filter(({ application }) => application.polling.nextPollAt).length,
    )
  })
})
