import "server-only"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { getContainer } from "@/src/config/container"
import type { OrderableService } from "@/src/core/domain/application/service"

/**
 * A funnel exists for a customer only while checkout takes its order (`SERVICES_ON_SALE`); otherwise
 * its route is not found. Read per request, so a page prerendered at build never bakes the answer in.
 */
export async function requireOnSale(service: OrderableService): Promise<void> {
  await connection()
  if (!getContainer().servicesOnSale.includes(service)) notFound()
}
