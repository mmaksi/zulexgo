"use server"

import { headers } from "next/headers"
import { getContainer } from "@/src/config/container"
import { cancelOrder, correctOrder } from "./order-change"
import type { OrderChangeState } from "./order-change-state"

export async function cancelOrderAction(token: string): Promise<OrderChangeState> {
  return cancelOrder(getContainer(), await headers(), token)
}

export async function correctOrderAction(token: string, input: unknown): Promise<OrderChangeState> {
  return correctOrder(getContainer(), await headers(), token, input)
}
