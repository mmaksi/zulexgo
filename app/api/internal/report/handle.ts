import { hasBearer } from "@/app/api/internal/bearer"
import type { OrdersReport } from "@/src/core/use-cases/monitoring/report-orders"

const DEFAULT_DAYS = 30
const MAX_DAYS = 365

/** A whole number of days from 1 to a year; the default when the query has none. */
function daysOf(query: string | null): number | undefined {
  if (query === null) return DEFAULT_DAYS
  if (!/^\d+$/.test(query)) return undefined
  const days = Number(query)
  return days >= 1 && days <= MAX_DAYS ? days : undefined
}

/**
 * The orders' numbers for a monitoring tool or an operator, behind the cron secret as a bearer token
 * like the poller. Counts only (`reportOrders`), never kept by a cache. A failed read is `503` with
 * no body, and only the kind of error is logged: it may carry a connection string.
 */
export async function handleReport(
  deps: { cronSecret: string | undefined; report: (days: number) => Promise<OrdersReport> },
  request: Request,
): Promise<Response> {
  if (!hasBearer(request, deps.cronSecret)) return new Response(null, { status: 401 })

  const days = daysOf(new URL(request.url).searchParams.get("days"))
  if (days === undefined) return new Response(null, { status: 400 })

  try {
    return Response.json(await deps.report(days), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error(`[report] failed: ${error instanceof Error ? error.name : "unknown error"}`)
    return new Response(null, { status: 503 })
  }
}
