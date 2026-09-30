"use server"

import { headers } from "next/headers"
import { getContainer } from "@/src/config/container"
import { cancelOrder } from "./order-change"
import type { OrderChangeState } from "./order-change-state"

/** Reachable by any POST, so the link is counted and checked before anything moves. */
export async function cancelOrderAction(token: string): Promise<OrderChangeState> {
  return cancelOrder(getContainer(), await headers(), token)
}
