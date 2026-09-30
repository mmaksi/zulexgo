import type { Application } from "@/src/core/domain/application"
import type { ApplicationReference } from "@/src/core/domain/application-reference"
import { POLLED_STATUSES } from "@/src/core/domain/application-status"
import { DuplicateApplication } from "@/src/core/errors/duplicate-application"
import { StaleApplication } from "@/src/core/errors/stale-application"
import type { ApplicationRepository } from "@/src/core/ports/application-repository"

/** Codes stay in plaintext here: nothing leaves the process. The Postgres adapter encrypts them. */
export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly applications = new Map<ApplicationReference, Application>()
  private readonly tokens = new Map<string, ApplicationReference>()

  /** Loads seed data keyed by reference, so the same entry twice is stored once. */
  constructor(seed: readonly { application: Application; statusToken?: string }[] = []) {
    for (const { application, statusToken } of seed) {
      this.store({ ...application, version: 1 })
      if (statusToken) this.tokens.set(statusToken, application.reference)
    }
  }

  async create(application: Application): Promise<Application> {
    if (this.applications.has(application.reference)) throw new DuplicateApplication("reference")
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
    if (!stored || stored.version !== application.version) throw new StaleApplication(application.reference)
    if (this.all().some((other) => other.reference !== stored.reference && other.idempotencyKey === application.idempotencyKey)) {
      throw new DuplicateApplication("idempotencyKey")
    }
    return this.store({ ...application, version: stored.version + 1 })
  }

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

  async findDueForPolling(now: Date, limit: number): Promise<Application[]> {
    return this.all()
      .filter(({ status, polling }) => POLLED_STATUSES.includes(status) && polling.nextPollAt && polling.nextPollAt <= now)
      .sort((a, b) => a.polling.nextPollAt!.getTime() - b.polling.nextPollAt!.getTime())
      .slice(0, limit)
      .map(copy)
  }

  private store(application: Application): Application {
    this.applications.set(application.reference, copy(application))
    return copy(application)
  }

  private all(): Application[] {
    return [...this.applications.values()]
  }
}

/** Value objects (codes, money) are immutable and shared; everything mutable is copied. */
const copy = (application: Application): Application => ({
  ...application,
  history: application.history.map((change) => ({ ...change, at: new Date(change.at) })),
  request: {
    ...application.request,
    licencePlate: { ...application.request.licencePlate },
    codes: { ...application.request.codes },
  },
  payment: { ...application.payment },
  polling: {
    ...application.polling,
    nextPollAt: application.polling.nextPollAt && new Date(application.polling.nextPollAt),
  },
})
