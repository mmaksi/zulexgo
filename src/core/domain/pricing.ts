import { Money } from "./money"

/** Retained on cancellation and on a non-correctable failure, whatever the service (business logic §3). It is part of the price, not added to it. */
export const PROCESSING_FEE = Money.ofCents(1999)

export type Service = "newRegistration" | "reRegistration" | "changeOfKeeper" | "deregistration" | "addressChange"

/** The founder's selling prices (PAngV): one all-inclusive amount per service, authority fee and processing fee included. */
export const SERVICE_PRICES: Record<Service, Money> = {
  newRegistration: Money.ofCents(12900),
  reRegistration: Money.ofCents(9900),
  changeOfKeeper: Money.ofCents(9900),
  deregistration: Money.ofCents(4900),
  addressChange: Money.ofCents(9900),
}

export const DEREGISTRATION_TOTAL = SERVICE_PRICES.deregistration

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

export function quote({ service, plates, fineDustSticker }: Basket): Quote {
  const atCheckout = SERVICE_PRICES[service]
  const afterCompletion = platesPrice(plates).add(fineDustSticker ? FINE_DUST_STICKER_PRICE : NOTHING)
  return { atCheckout, afterCompletion, total: atCheckout.add(afterCompletion) }
}

/** Shipping belongs to plates only: a sticker travels without it. */
function platesPrice(plates: Basket["plates"]): Money {
  if (!plates) return NOTHING
  const perPlate = plates.carbon ? PLATE_PRICE.add(CARBON_SURCHARGE) : PLATE_PRICE
  const bothPlates = plates.count === 2 ? perPlate.add(perPlate) : perPlate
  return bothPlates.add(PLATE_SHIPPING)
}
