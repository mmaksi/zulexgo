import "server-only"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { getContainer } from "@/src/config/container"
import type { OrderableService } from "@/src/core/domain/application/service"

export async function requireOnSale(service: OrderableService): Promise<void> {
  await connection()
  if (!getContainer().servicesOnSale.includes(service)) notFound()
}
