import { parseDeregistrationRequest, type DeregistrationRequest } from "./deregistration-request"

/** The services on the price list, sold or not. */
export const SERVICES = ["newRegistration", "reRegistration", "changeOfKeeper", "deregistration", "addressChange"] as const
export type Service = (typeof SERVICES)[number]

/**
 * What an order for each service carries. Every member names its service, so code that handles
 * one narrows to its own fields and the compiler finds the places that assumed another. Only
 * de-registration has a request so far.
 */
export type ServiceRequest = DeregistrationRequest

/** The services an order can be taken for: those with a request type. */
export type OrderableService = ServiceRequest["service"]

/**
 * What checkout sells. A card on the landing page is not a gate (the funnel's server action is
 * reachable by any POST), so `submitCheckout` checks this list before it opens a payment.
 */
export const SERVICES_ON_SALE: readonly OrderableService[] = ["deregistration"]

export const isOnSale = (service: unknown): service is OrderableService => SERVICES_ON_SALE.some((onSale) => onSale === service)

const REQUEST_PARSERS: Record<OrderableService, (input: unknown) => ServiceRequest> = {
  deregistration: parseDeregistrationRequest,
}

/** Parses what the customer entered for `service`; throws a `ValidationError` naming every invalid field. */
export const parseServiceRequest = (service: OrderableService, input: unknown): ServiceRequest => REQUEST_PARSERS[service](input)
