import "server-only"
import { cookies } from "next/headers"
import { getContainer } from "@/src/config/container"
import type { OrderableService } from "@/src/core/domain/application/service"

const WEEK_IN_SECONDS = 7 * 24 * 60 * 60
const nameOf = (service: OrderableService) => `invite-${service}`

export async function heldInvite(service: OrderableService): Promise<string | undefined> {
  return (await cookies()).get(nameOf(service))?.value
}

export async function holdInvite(service: OrderableService, code: string): Promise<void> {
  ;(await cookies()).set(nameOf(service), code, {
    httpOnly: true,
    secure: getContainer().env.APP_ENV !== "dev",
    sameSite: "lax",
    path: "/",
    maxAge: WEEK_IN_SECONDS,
  })
}
