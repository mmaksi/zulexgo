import type { Service } from "@/src/core/domain/application/service"
import { Money } from "./money"

export const PROCESSING_FEE = Money.ofCents(1999)

// PAngV: one all-inclusive price per service, the authority and processing fees included.
export const SERVICE_PRICES: Record<Service, Money> = {
  newRegistration: Money.ofCents(12900),
  reRegistration: Money.ofCents(9900),
  changeOfKeeper: Money.ofCents(9900),
  deregistration: Money.ofCents(4900),
  addressChange: Money.ofCents(9900),
}

// Provisional: launch plan Q41: shown on the landing page, not sold.
export const PLATE_PRICE = Money.ofCents(1250)
export const CARBON_SURCHARGE = Money.ofCents(400)
export const FINE_DUST_STICKER_PRICE = Money.ofCents(999)
export const PLATE_SHIPPING = Money.ofCents(495)
