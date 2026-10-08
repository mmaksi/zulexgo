import type { Service } from "@/src/core/domain/application/service"
import { Money } from "./money"

/** Retained on cancellation and on a non-correctable failure, whatever the service (business logic §3). It is part of the price, not added to it. */
export const PROCESSING_FEE = Money.ofCents(1999)

/**
 * The founder's selling prices (PAngV): one all-inclusive amount per service, authority fee and processing fee included.
 * What an order costs: the amount its payment is opened for, and the total every refund is worked out from.
 */
export const SERVICE_PRICES: Record<Service, Money> = {
  newRegistration: Money.ofCents(12900),
  reRegistration: Money.ofCents(9900),
  changeOfKeeper: Money.ofCents(9900),
  deregistration: Money.ofCents(4900),
  addressChange: Money.ofCents(9900),
}

/**
 * The add-ons of the founder's price list. None is sold yet (Q41): `quote` already prices them so
 * the rule is pinned by tests. `PLATE_PRICE` is per plate, `CARBON_SURCHARGE` is added per carbon
 * plate, and `PLATE_SHIPPING` is charged once per order of plates, not per plate.
 */
export const PLATE_PRICE = Money.ofCents(1250)
export const CARBON_SURCHARGE = Money.ofCents(400)
export const FINE_DUST_STICKER_PRICE = Money.ofCents(999)
export const PLATE_SHIPPING = Money.ofCents(495)
const NOTHING = Money.ofCents(0)

/** A service and what the customer adds to it. */
export type Basket = {
  service: Service
  plates?: { count: 1 | 2; carbon: boolean }
  fineDustSticker?: boolean
}

export type Quote = {
  /** The service: the only amount a payment is opened for, authorised when the customer pays. */
  atCheckout: Money
  /** Plates, sticker and shipping: ordered and charged only once the KBA has completed the service, never if it rejects it. */
  afterCompletion: Money
  total: Money
}

/**
 * Splits a basket into what is charged at checkout and what falls due after the KBA has
 * completed the service. Only the service itself is ever charged at checkout, whatever else is
 * in the basket, and `total` is what the customer pays in all if the service completes.
 */
export function quote({ service, plates, fineDustSticker }: Basket): Quote {
  const atCheckout = SERVICE_PRICES[service]
  const afterCompletion = platesPrice(plates).add(fineDustSticker ? FINE_DUST_STICKER_PRICE : NOTHING)
  return { atCheckout, afterCompletion, total: atCheckout.add(afterCompletion) }
}

/**
 * Shipping belongs to plates only: a sticker travels without it. It is charged once, for one
 * plate or two.
 */
function platesPrice(plates: Basket["plates"]): Money {
  if (!plates) return NOTHING
  const perPlate = plates.carbon ? PLATE_PRICE.add(CARBON_SURCHARGE) : PLATE_PRICE
  const bothPlates = plates.count === 2 ? perPlate.add(perPlate) : perPlate
  return bothPlates.add(PLATE_SHIPPING)
}
