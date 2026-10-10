import type { Application } from "@/src/core/domain/application/application"
import type { ApplicationReference } from "@/src/core/domain/application/application-reference"
import type { DeregistrationRequest } from "@/src/core/domain/application/deregistration-request"
import type { NewRegistrationRequest } from "@/src/core/domain/application/new-registration-request"
import type { OrderTrail } from "@/src/core/domain/application/order-report"
import type { OrderableService } from "@/src/core/domain/application/service"

export interface ApplicationRepository {
  create(application: Application): Promise<Application>
  get(reference: ApplicationReference): Promise<Application | undefined>
  // Version-checked: the poller and webhooks race. Postgres appends only new history entries.
  update(application: Application): Promise<Application>
  // The token is the order's only credential: stored encrypted, looked up by hash, never logged.
  setStatusToken(reference: ApplicationReference, token: string): Promise<void>
  getStatusToken(reference: ApplicationReference): Promise<string | undefined>
  findByStatusToken(token: string): Promise<Application | undefined>
  // Advisory, not a lock: two checkouts racing can both see `false`.
  hasOpenApplication(vehicle: Pick<DeregistrationRequest, "service" | "licencePlate" | "vin"> | Pick<NewRegistrationRequest, "service" | "vin">): Promise<boolean>
  findDueForPolling(now: Date, limit: number): Promise<Application[]>
  findTrailsSince(service: OrderableService, since: Date): Promise<readonly OrderTrail[]>
}
