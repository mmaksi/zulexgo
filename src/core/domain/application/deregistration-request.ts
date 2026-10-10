import { z } from "zod"
import { licencePlateSchema } from "@/src/core/domain/vehicle/licence-plate"
import { SecurityCode } from "@/src/core/domain/vehicle/security-code"
import { validate } from "@/src/core/domain/validate"
import { vinSchema } from "@/src/core/domain/vehicle/vin"

const vehicle = { licencePlate: licencePlateSchema, vin: vinSchema }

const twoPlateCodes = z.object({
  rearPlate: SecurityCode.schema("rearPlate"),
  frontPlate: SecurityCode.schema("frontPlate"),
  certificate: SecurityCode.schema("certificate"),
})

const onePlateCodes = z.object({
  rearPlate: SecurityCode.schema("rearPlate"),
  certificate: SecurityCode.schema("certificate"),
})

/**
 * What the customer enters and Zulex receives. The front plate code exists only
 * on two-plate vehicles; the API cannot tell, so the plate count decides here.
 */
export const deregistrationRequestSchema = z
  .discriminatedUnion("plateCount", [
    z.object({ plateCount: z.literal(2), ...vehicle, codes: twoPlateCodes }),
    z.object({ plateCount: z.literal(1), ...vehicle, codes: onePlateCodes }),
  ])
  // A one-plate request gets an explicit `frontPlate: undefined`, so it reads on either shape.
  // It names its service, which the browser never sends: the request is what tells an order's service.
  .transform((request) => ({ service: "deregistration" as const, ...request, codes: { frontPlate: undefined, ...request.codes } }))

/** Parsed: plate and VIN normalised, each code a `SecurityCode` that prints as a placeholder. */
export type DeregistrationRequest = z.output<typeof deregistrationRequestSchema>

/**
 * A de-registration as an order stores it: `DeregistrationRequest`, but without the security codes once the
 * order has ended (`withoutCodes`). The codes prove possession for one filing, and an order that has ended is
 * never filed again (launch plan Q22, provisional).
 */
const storedRequestSchema = z
  .discriminatedUnion("plateCount", [
    z.object({ plateCount: z.literal(2), ...vehicle, codes: twoPlateCodes.optional() }),
    z.object({ plateCount: z.literal(1), ...vehicle, codes: onePlateCodes.optional() }),
  ])
  .transform(({ codes, ...request }) => ({ service: "deregistration" as const, ...request, ...(codes && { codes: { frontPlate: undefined, ...codes } }) }))

export type StoredDeregistrationRequest = z.output<typeof storedRequestSchema>

/**
 * Throws a `ValidationError` naming every invalid field at once, dotted for nested ones
 * (`codes.certificate`, `licencePlate.prefix`), never their values.
 */
export const parseDeregistrationRequest = (input: unknown): DeregistrationRequest =>
  validate(deregistrationRequestSchema, input, "request")

/** Reads what an order stored: as `parseDeregistrationRequest`, but an order may no longer hold its codes. */
export const parseStoredDeregistrationRequest = (input: unknown): StoredDeregistrationRequest =>
  validate(storedRequestSchema, input, "request")

/** The request of an order that has ended: nothing but the security codes is taken from it. */
export function withoutCodes(request: StoredDeregistrationRequest): StoredDeregistrationRequest {
  const kept = { ...request }
  delete kept.codes
  return kept
}
