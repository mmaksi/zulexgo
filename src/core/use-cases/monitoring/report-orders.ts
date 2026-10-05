import { ORDERABLE_SERVICES, type OrderableService } from "@/src/core/domain/application/service"
import { orderReport, type OrderReport } from "@/src/core/domain/application/order-report"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

const DAY_MS = 24 * 60 * 60_000

export interface OrdersReport {
  readonly generatedAt: Date
  /** The orders created at or after this moment are counted. */
  readonly since: Date
  readonly services: Readonly<Record<OrderableService, OrderReport>>
}

/**
 * What an operator watches in the first weeks of a service: where its orders stand, how many wait for
 * a customer's identity and for how long past their deadline, how verifications end, and how many
 * orders are refused for good. Over the orders of the last `days` days, per service. Counts only: no
 * reference, address or detail of any order is read, so the report can be handed to a monitoring tool.
 */
export async function reportOrders(deps: Pick<Dependencies, "repository" | "clock">, days: number): Promise<OrdersReport> {
  const generatedAt = deps.clock.now()
  const since = new Date(generatedAt.getTime() - days * DAY_MS)
  const entries = await Promise.all(
    ORDERABLE_SERVICES.map(async (service) => [service, orderReport(await deps.repository.findTrailsSince(service, since), generatedAt)] as const),
  )
  return { generatedAt, since, services: Object.fromEntries(entries) as OrdersReport["services"] }
}
