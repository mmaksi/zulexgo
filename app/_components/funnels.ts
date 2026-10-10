import type { OrderableService } from "@/src/core/domain/application/service"

export const FUNNELS: Record<OrderableService, { href: string; label: string }> = {
  deregistration: { href: "/deregister", label: "Jetzt abmelden" },
  newRegistration: { href: "/register", label: "Jetzt zulassen" },
}
