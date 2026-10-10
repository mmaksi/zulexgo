import type { Application } from "@/src/core/domain/application/application"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import { OPEN_STATUSES, POLLED_STATUSES } from "@/src/core/domain/application/application-status"
import type { OrderTrail } from "@/src/core/domain/application/order-report"
import type { OrderableService, ServiceRequest } from "@/src/core/domain/application/service"
import { DuplicateApplication } from "@/src/core/errors/application/duplicate-application"
import { StaleApplication } from "@/src/core/errors/application/stale-application"
import type { ApplicationRepository } from "@/src/core/ports/repository/application-repository"

// No locks: no method awaits between check and write, so each runs atomically, like one SQL statement.
export class InMemoryApplicationRepository implements ApplicationRepository {
  private readonly applications = new Map<ApplicationReference, Application>()
  private readonly tokens = new Map<string, ApplicationReference>()

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

  async hasOpenApplication(vehicle: Parameters<ApplicationRepository["hasOpenApplication"]>[0]): Promise<boolean> {
    return this.all().some(({ status, request }) => OPEN_STATUSES.includes(status) && isTheVehicle(request, vehicle))
  }

  async findDueForPolling(now: Date, limit: number): Promise<Application[]> {
    return this.all()
      .filter(({ status, polling }) => POLLED_STATUSES.includes(status) && polling.nextPollAt && polling.nextPollAt <= now)
      .sort((a, b) => a.polling.nextPollAt!.getTime() - b.polling.nextPollAt!.getTime())
      .slice(0, limit)
      .map(copy)
  }

  async findTrailsSince(service: OrderableService, since: Date): Promise<readonly OrderTrail[]> {
    return this.all()
      .filter(({ request, history }) => request.service === service && history[0].at >= since)
      .map(({ status, history, identityVerification }) => ({
        status,
        history: history.map((change) => ({ ...change, at: new Date(change.at) })),
        verificationDeadline: identityVerification && new Date(identityVerification.deadline),
      }))
  }

  private store(application: Application): Application {
    this.applications.set(application.reference, copy(application))
    return copy(application)
  }

  private all(): Application[] {
    return [...this.applications.values()]
  }
}

function isTheVehicle(request: ServiceRequest, vehicle: Parameters<ApplicationRepository["hasOpenApplication"]>[0]): boolean {
  if (request.service !== vehicle.service || request.vin !== vehicle.vin) return false
  if (request.service === "deregistration" && vehicle.service === "deregistration") {
    const { prefix, letters, numbers } = request.licencePlate
    return prefix === vehicle.licencePlate.prefix && letters === vehicle.licencePlate.letters && numbers === vehicle.licencePlate.numbers
  }
  return true
}

function copyRequest(request: ServiceRequest): ServiceRequest {
  switch (request.service) {
    case "deregistration":
      return { ...request, licencePlate: { ...request.licencePlate }, ...(request.codes && { codes: { ...request.codes } }) }
    case "newRegistration":
      return {
        ...request,
        registrationCertificate: { ...request.registrationCertificate },
        owner: { ...request.owner },
        plate: { ...request.plate, ...(request.plate.seasonal && { seasonal: { ...request.plate.seasonal } }) },
      }
  }
}

const copy = (application: Application): Application => ({
  ...application,
  history: application.history.map((change) => ({ ...change, at: new Date(change.at) })),
  request: copyRequest(application.request),
  consent: application.consent && { ...application.consent, givenAt: new Date(application.consent.givenAt) },
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
