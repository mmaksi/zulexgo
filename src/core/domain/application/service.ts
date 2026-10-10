import { parseDeregistrationRequest, type StoredDeregistrationRequest } from "./deregistration-request"
import { parseNewRegistrationRequest, type StoredNewRegistrationRequest } from "./new-registration-request"

export const SERVICES = ["newRegistration", "reRegistration", "changeOfKeeper", "deregistration", "addressChange"] as const
export type Service = (typeof SERVICES)[number]

export type ServiceRequest = StoredDeregistrationRequest | StoredNewRegistrationRequest

export type OrderableService = ServiceRequest["service"]

const REQUEST_PARSERS: Record<OrderableService, (input: unknown, now: Date) => ServiceRequest> = {
  deregistration: (input) => parseDeregistrationRequest(input),
  newRegistration: parseNewRegistrationRequest,
}

export const ORDERABLE_SERVICES = Object.keys(REQUEST_PARSERS) as OrderableService[]

export const isOrderable = (service: unknown): service is OrderableService => typeof service === "string" && Object.hasOwn(REQUEST_PARSERS, service)

export const parseServiceRequest = (service: OrderableService, input: unknown, now: Date) => REQUEST_PARSERS[service](input, now)
