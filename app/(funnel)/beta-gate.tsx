import type { ReactNode } from "react"
import { getContainer } from "@/src/config/container"
import { mayOrder } from "@/src/core/domain/application/beta"
import type { OrderableService } from "@/src/core/domain/application/service"
import { InviteForm } from "./_components/invite-form"
import { heldInvite } from "./invite-cookie"
import { redeemInviteAction } from "./redeem-invite-action"

/**
 * In front of a funnel: while its service is in beta, a browser that has not redeemed a code checkout still
 * accepts sees the invite form instead, so nobody types an IBAN into a funnel that would refuse the order.
 * `name` is how the form speaks of the service. The real gate is `submitCheckout`.
 */
export async function BetaGate({ service, name, children }: { service: OrderableService; name: string; children: ReactNode }) {
  if (mayOrder(getContainer().beta, service, await heldInvite(service))) return children
  return <InviteForm service={name} action={redeemInviteAction.bind(null, service)} />
}
