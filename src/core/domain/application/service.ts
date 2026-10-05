import { parseDeregistrationRequest, type DeregistrationRequest } from "./deregistration-request"
import { parseNewRegistrationRequest, type NewRegistrationRequest } from "./new-registration-request"

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
 * service on sale is orderable, so its funnel, its request parser and its authority lookup exist
 * before it is added here (the Neuzulassung funnel is built and not sold: launch plan N9 adds it).
 * Production refuses to boot on the fake identity check while a service that verifies is listed.
 */
export const SERVICES_ON_SALE = ["deregistration"] as const satisfies readonly OrderableService[]
export type ServiceOnSale = (typeof SERVICES_ON_SALE)[number]

export const isOnSale = (service: unknown): service is ServiceOnSale => SERVICES_ON_SALE.some((onSale) => onSale === service)

/** `now` is the moment the request is taken: a keeper's age is checked against it. */
const REQUEST_PARSERS: Record<OrderableService, (input: unknown, now: Date) => ServiceRequest> = {
  deregistration: (input) => parseDeregistrationRequest(input),
  newRegistration: parseNewRegistrationRequest,
}

/** Whether `service` is one an order can be made for. Takes anything: the value comes from the browser. */
export const isOrderable = (service: unknown): service is OrderableService => typeof service === "string" && Object.hasOwn(REQUEST_PARSERS, service)

/** Parses what the customer entered for `service`; throws a `ValidationError` naming every invalid field. */
export const parseServiceRequest = (service: OrderableService, input: unknown, now: Date) => REQUEST_PARSERS[service](input, now)
