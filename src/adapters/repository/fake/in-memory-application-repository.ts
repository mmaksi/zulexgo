import type { Application } from "@/src/core/domain/application/application"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { OPEN_STATUSES, POLLED_STATUSES } from "@/src/core/domain/application/application-status"
import type { ServiceRequest } from "@/src/core/domain/application/service"
import { DuplicateApplication } from "@/src/core/errors/application/duplicate-application"
import { StaleApplication } from "@/src/core/errors/application/stale-application"
import type { ApplicationRepository } from "@/src/core/ports/repository/application-repository"

/**
 * Codes and personal data stay in plaintext here: nothing leaves the process. The Postgres adapter encrypts them.
 *
 * Wired when `REPOSITORY_DRIVER=fake`, the default outside production (production rejects it at
 * boot), and used directly by tests. It is seeded at every boot, forgets everything on restart, and
 * belongs to one process: a deployment with several instances would give each its own copy, so those
 * use Postgres. It passes the same contract suite as the Postgres adapter.
 *
 * No locking is needed: no method awaits between its check and its write, and JavaScript runs one
 * of them to completion at a time, so `create`'s uniqueness checks and `update`'s version check are
 * atomic, like the single statements they stand in for in Postgres.
 */
export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly applications = new Map<ApplicationReference, Application>()
  private readonly tokens = new Map<string, ApplicationReference>()

  /**
   * Loads seed data keyed by reference, so the same entry twice is stored once. Every seeded
   * application starts at version 1 whatever version it carries, as `create` would store it.
   */
  constructor(seed: readonly { application: Application; statusToken?: string }[] = []) {
    for (const { application, statusToken } of seed) {
      this.store({ ...application, version: 1 })
      if (statusToken) this.tokens.set(statusToken, application.reference)
    }
  }

  async create(application: Application): Promise<Application> {
    if (this.applications.has(application.reference)) throw new DuplicateApplication("reference")
    // Scans every application for the key: there is no index, and the store is only ever seed-sized.
    if (this.all().some((stored) => stored.idempotencyKey === application.idempotencyKey)) {
      throw new DuplicateApplication("idempotencyKey")
    }
    return this.store({ ...application, version: 1 })
  }

  async get(reference: ApplicationReference): Promise<Application | undefined> {
    const stored = this.applications.get(reference)
    return stored && copy(stored)
  }

  async update(application: Application): Promise<Application> {
    const stored = this.applications.get(application.reference)
    // An application never created is stale too, as in Postgres, where the UPDATE matches no row.
    if (!stored || stored.version !== application.version) throw new StaleApplication(application.reference)
    if (this.all().some((other) => other.reference !== stored.reference && other.idempotencyKey === application.idempotencyKey)) {
      throw new DuplicateApplication("idempotencyKey")
    }
    return this.store({ ...application, version: stored.version + 1 })
  }

  /**
   * Plain `Error`s for an unknown order or a token another order holds, as the port allows and as
   * Postgres' foreign-key and unique violations surface there: both are caller bugs, not domain cases.
   * Removing the order's earlier token is what revokes the old link.
   */
  async setStatusToken(reference: ApplicationReference, token: string): Promise<void> {
    if (!this.applications.has(reference)) throw new Error(`InMemoryApplicationRepository: unknown application ${reference}`)
    const holder = this.tokens.get(token)
    if (holder && holder !== reference) throw new Error("InMemoryApplicationRepository: status token already held by another application")
    for (const [existing, owner] of this.tokens) if (owner === reference) this.tokens.delete(existing)
    this.tokens.set(token, reference)
  }

  async getStatusToken(reference: ApplicationReference): Promise<string | undefined> {
    return [...this.tokens].find(([, owner]) => owner === reference)?.[0]
  }

  async findByStatusToken(token: string): Promise<Application | undefined> {
    const reference = this.tokens.get(token)
    return reference && this.get(reference)
  }

  async hasOpenApplication(vehicle: Parameters<ApplicationRepository["hasOpenApplication"]>[0]): Promise<boolean> {
    return this.all().some(({ status, request }) => OPEN_STATUSES.includes(status) && isTheVehicle(request, vehicle))
  }

  async findDueForPolling(now: Date, limit: number): Promise<Application[]> {
    return this.all()
      .filter(({ status, polling }) => POLLED_STATUSES.includes(status) && polling.nextPollAt && polling.nextPollAt <= now)
      // The filter dropped every application without a nextPollAt, so the assertions hold.
      .sort((a, b) => a.polling.nextPollAt!.getTime() - b.polling.nextPollAt!.getTime())
      .slice(0, limit)
      .map(copy)
  }

  /** Stores a copy and returns another, so neither the caller nor the result holds the stored object. */
  private store(application: Application): Application {
    this.applications.set(application.reference, copy(application))
    return copy(application)
  }

  /** The stored objects themselves, not copies: for scans inside this class, never to hand out. */
  private all(): Application[] {
    return [...this.applications.values()]
  }
}

/** What names the car depends on the service, as in `hasOpenApplication`: plate and VIN for a de-registration, the VIN alone for a Neuzulassung. */
function isTheVehicle(request: ServiceRequest, vehicle: Parameters<ApplicationRepository["hasOpenApplication"]>[0]): boolean {
  if (request.service !== vehicle.service || request.vin !== vehicle.vin) return false
  if (request.service === "deregistration" && vehicle.service === "deregistration") {
    const { prefix, letters, numbers } = request.licencePlate
    return prefix === vehicle.licencePlate.prefix && letters === vehicle.licencePlate.letters && numbers === vehicle.licencePlate.numbers
  }
  return true
}

/** The parts of a request that are mutable objects. A secret is shared, not copied: only what `reveal()` hands out could be changed, and no caller changes it. */
function copyRequest(request: ServiceRequest): ServiceRequest {
  switch (request.service) {
    case "deregistration":
      return { ...request, licencePlate: { ...request.licencePlate }, codes: { ...request.codes } }
    case "newRegistration":
      return {
        ...request,
        registrationCertificate: { ...request.registrationCertificate },
        owner: { ...request.owner },
        plate: { ...request.plate, ...(request.plate.seasonal && { seasonal: { ...request.plate.seasonal } }) },
      }
  }
}

/** Value objects (codes, money) are immutable and shared; everything mutable is copied, Dates too. */
const copy = (application: Application): Application => ({
  ...application,
  history: application.history.map((change) => ({ ...change, at: new Date(change.at) })),
  request: copyRequest(application.request),
  payment: { ...application.payment },
  identityVerification: application.identityVerification && {
    ...application.identityVerification,
    deadline: new Date(application.identityVerification.deadline),
  },
  polling: {
    ...application.polling,
    nextPollAt: application.polling.nextPollAt && new Date(application.polling.nextPollAt),
  },
})
