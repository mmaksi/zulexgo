import { ORDERABLE_SERVICES, type OrderableService } from "@/src/core/domain/application/service"
import { orderReport, type OrderReport } from "@/src/core/domain/application/order-report"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

const DAY_MS = 24 * 60 * 60_000

export interface OrdersReport {
  readonly generatedAt: Date
  readonly since: Date
  readonly services: Readonly<Record<OrderableService, OrderReport>>
}

// Counts only, no personal data: the report is handed to a monitoring tool.
export async function reportOrders(deps: Pick<Dependencies, "repository" | "clock">, days: number): Promise<OrdersReport> {
  const generatedAt = deps.clock.now()
  const since = new Date(generatedAt.getTime() - days * DAY_MS)
  const entries = await Promise.all(
    ORDERABLE_SERVICES.map(async (service) => [service, orderReport(await deps.repository.findTrailsSince(service, since), generatedAt)] as const),
  )
  return { generatedAt, since, services: Object.fromEntries(entries) as OrdersReport["services"] }
}
