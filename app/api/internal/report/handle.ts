import { hasBearer } from "@/app/api/internal/bearer"
import type { OrdersReport } from "@/src/core/use-cases/monitoring/report-orders"

const DEFAULT_DAYS = 30
const MAX_DAYS = 365

function daysOf(query: string | null): number | undefined {
  if (query === null) return DEFAULT_DAYS
  if (!/^\d+$/.test(query)) return undefined
  const days = Number(query)
  return days >= 1 && days <= MAX_DAYS ? days : undefined
}

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
    // Name only: a failed read's message may carry a connection string
    console.error(`[report] failed: ${error instanceof Error ? error.name : "unknown error"}`)
    return new Response(null, { status: 503 })
  }
}
