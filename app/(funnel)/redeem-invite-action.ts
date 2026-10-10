"use server"

import { headers } from "next/headers"
import { getContainer } from "@/src/config/container"
import { isOrderable } from "@/src/core/domain/application/service"
import type { InviteAnswer } from "./_components/invite-form"
import { holdInvite } from "./invite-cookie"
import { redeemInvite } from "./redeem-invite"

export async function redeemInviteAction(service: string, code: string): Promise<InviteAnswer> {
  if (!isOrderable(service)) return { status: "refused" }

  const result = await redeemInvite(getContainer(), await headers(), service, code)
  if (result.status !== "accepted") return result

  await holdInvite(service, result.invite)
  return { status: "accepted" }
}
