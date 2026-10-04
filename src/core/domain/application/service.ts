import { parseDeregistrationRequest, type DeregistrationRequest } from "./deregistration-request"
import type { NewRegistrationRequest } from "./new-registration-request"

/** The services on the price list, sold or not. */
export const SERVICES = ["newRegistration", "reRegistration", "changeOfKeeper", "deregistration", "addressChange"] as const
export type Service = (typeof SERVICES)[number]

/**
 * What an order for each service carries. Every member names its service, so code that handles
 * one narrows to its own fields and the compiler finds the places that assumed another.
 */
export type ServiceRequest = DeregistrationRequest | NewRegistrationRequest

/** The services an order exists for: those with a request type. Not all of them are sold yet. */
export type OrderableService = ServiceRequest["service"]

/**
 * What checkout sells. A card on the landing page is not a gate (the funnel's server action is
 * reachable by any POST), so `submitCheckout` checks this list before it opens a payment. A
 * service has a funnel button and a request the checkout can parse only once it is on sale, so
 * those are keyed by `ServiceOnSale`, and adding a service here fails to compile until each exists.
 */
export const SERVICES_ON_SALE = ["deregistration"] as const satisfies readonly OrderableService[]
export type ServiceOnSale = (typeof SERVICES_ON_SALE)[number]

export const isOnSale = (service: unknown): service is ServiceOnSale => SERVICES_ON_SALE.some((onSale) => onSale === service)

const REQUEST_PARSERS: Record<ServiceOnSale, (input: unknown) => Extract<ServiceRequest, { service: ServiceOnSale }>> = {
  deregistration: parseDeregistrationRequest,
}

/** Parses what the customer entered for `service`; throws a `ValidationError` naming every invalid field. */
export const parseServiceRequest = (service: ServiceOnSale, input: unknown) => REQUEST_PARSERS[service](input)
