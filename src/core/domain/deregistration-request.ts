import { z } from "zod"
import { licencePlateSchema } from "./licence-plate"
import { SecurityCode } from "./security-code"
import { validate } from "./validate"
import { vinSchema } from "./vin"

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
  .transform((request) => ({ ...request, codes: { frontPlate: undefined, ...request.codes } }))

export type DeregistrationRequest = z.output<typeof deregistrationRequestSchema>

export const parseDeregistrationRequest = (input: unknown): DeregistrationRequest =>
  validate(deregistrationRequestSchema, input, "request")
