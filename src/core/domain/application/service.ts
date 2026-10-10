import { parseDeregistrationRequest, type StoredDeregistrationRequest } from "./deregistration-request"
import { parseNewRegistrationRequest, type StoredNewRegistrationRequest } from "./new-registration-request"

/** The services on the price list, sold or not. */
export const SERVICES = ["newRegistration", "reRegistration", "changeOfKeeper", "deregistration", "addressChange"] as const
export type Service = (typeof SERVICES)[number]

/**
 * What an order for each service carries. Every member names its service, so code that handles
 * one narrows to its own fields and the compiler finds the places that assumed another. A
 * de-registration's request has its security codes, and a Neuzulassung's its bank account, until the order ends.
 */
export type ServiceRequest = StoredDeregistrationRequest | StoredNewRegistrationRequest

/** The services an order exists for: those with a request type. Not all of them are sold yet. */
export type OrderableService = ServiceRequest["service"]

/** `now` is the moment the request is taken: a keeper's age is checked against it. */
const REQUEST_PARSERS: Record<OrderableService, (input: unknown, now: Date) => ServiceRequest> = {
  deregistration: (input) => parseDeregistrationRequest(input),
  newRegistration: parseNewRegistrationRequest,
}

/** Every service an order can be made for. */
export const ORDERABLE_SERVICES = Object.keys(REQUEST_PARSERS) as OrderableService[]

/** Whether `service` is one an order can be made for. Takes anything: the value comes from the browser. */
export const isOrderable = (service: unknown): service is OrderableService => typeof service === "string" && Object.hasOwn(REQUEST_PARSERS, service)

/** Parses what the customer entered for `service`; throws a `ValidationError` naming every invalid field. */
export const parseServiceRequest = (service: OrderableService, input: unknown, now: Date) => REQUEST_PARSERS[service](input, now)
