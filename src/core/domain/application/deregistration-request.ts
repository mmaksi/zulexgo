import { z } from "zod"
import { licencePlateSchema } from "@/src/core/domain/vehicle/licence-plate"
import { SecurityCode } from "@/src/core/domain/vehicle/security-code"
import { validate } from "@/src/core/domain/validate"
import { vinSchema } from "@/src/core/domain/vehicle/vin"

const vehicle = { licencePlate: licencePlateSchema, vin: vinSchema }

/**
 * What the customer enters and Zulex receives. The front plate code exists only
 * on two-plate vehicles; the API cannot tell, so the plate count decides here.
 */
export const deregistrationRequestSchema = z
  .discriminatedUnion("plateCount", [
    z.object({
      plateCount: z.literal(2),
      ...vehicle,
      codes: z.object({
        rearPlate: SecurityCode.schema("rearPlate"),
        frontPlate: SecurityCode.schema("frontPlate"),
        certificate: SecurityCode.schema("certificate"),
      }),
    }),
    z.object({
      plateCount: z.literal(1),
      ...vehicle,
      codes: z.object({
        rearPlate: SecurityCode.schema("rearPlate"),
        certificate: SecurityCode.schema("certificate"),
      }),
    }),
  ])
  // A one-plate request gets an explicit `frontPlate: undefined`, so it reads on either shape.
  .transform((request) => ({ ...request, codes: { frontPlate: undefined, ...request.codes } }))

/** Parsed: plate and VIN normalised, each code a `SecurityCode` that prints as a placeholder. */
export type DeregistrationRequest = z.output<typeof deregistrationRequestSchema>

/**
 * Throws a `ValidationError` naming every invalid field at once, dotted for nested ones
 * (`codes.certificate`, `licencePlate.prefix`), never their values.
 */
export const parseDeregistrationRequest = (input: unknown): DeregistrationRequest =>
  validate(deregistrationRequestSchema, input, "request")
