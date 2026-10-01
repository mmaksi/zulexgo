"use server"

import { headers } from "next/headers"
import { getContainer } from "@/src/config/container"
import { cancelOrder, correctOrder } from "./order-change"
import type { OrderChangeState } from "./order-change-state"

/** Reachable by any POST, so the link is counted and checked before anything moves. */
export async function cancelOrderAction(token: string): Promise<OrderChangeState> {
  return cancelOrder(getContainer(), await headers(), token)
}

/** Reachable by any POST with any body: the fields are read as text only, and counted like a cancel. */
export async function correctOrderAction(token: string, input: unknown): Promise<OrderChangeState> {
  return correctOrder(getContainer(), await headers(), token, input)
}
