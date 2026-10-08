import { getContainer } from "@/src/config/container"
import { reportOrders } from "@/src/core/use-cases/monitoring/report-orders"
import { handleReport } from "./handle"

export async function GET(request: Request) {
  const container = getContainer()
  return handleReport({ cronSecret: container.env.CRON_SECRET, report: (days) => reportOrders(container, days) }, request)
}
