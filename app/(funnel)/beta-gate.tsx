import type { ReactNode } from "react"
import { getContainer } from "@/src/config/container"
import { mayOrder } from "@/src/core/domain/application/beta"
import type { OrderableService } from "@/src/core/domain/application/service"
import { InviteForm } from "./_components/invite-form"
import { heldInvite } from "./invite-cookie"
import { redeemInviteAction } from "./redeem-invite-action"

// Courtesy only: submitCheckout is the real gate
export async function BetaGate({ service, name, children }: { service: OrderableService; name: string; children: ReactNode }) {
  if (mayOrder(getContainer().beta, service, await heldInvite(service))) return children
  return <InviteForm service={name} action={redeemInviteAction.bind(null, service)} />
}
