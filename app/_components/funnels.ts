import type { OrderableService } from "@/src/core/domain/application/service"

/**
 * Where each service's funnel is, and what its button says: site-contract.md §2.1, CTA label <=20 chars.
 * A funnel exists for every orderable service; a card or a status page links to it only once the service is on sale.
 */
export const FUNNELS: Record<OrderableService, { href: string; label: string }> = {
  deregistration: { href: "/deregister", label: "Jetzt abmelden" },
  newRegistration: { href: "/register", label: "Jetzt zulassen" },
}
