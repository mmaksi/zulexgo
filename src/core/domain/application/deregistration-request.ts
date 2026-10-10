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

export const deregistrationRequestSchema = z
  .discriminatedUnion("plateCount", [
    z.object({ plateCount: z.literal(2), ...vehicle, codes: twoPlateCodes }),
    z.object({ plateCount: z.literal(1), ...vehicle, codes: onePlateCodes }),
  ])
  .transform((request) => ({ service: "deregistration" as const, ...request, codes: { frontPlate: undefined, ...request.codes } }))

export type DeregistrationRequest = z.output<typeof deregistrationRequestSchema>

// Provisional: launch plan Q22: an order that has ended drops its codes.
const storedRequestSchema = z
  .discriminatedUnion("plateCount", [
    z.object({ plateCount: z.literal(2), ...vehicle, codes: twoPlateCodes.optional() }),
    z.object({ plateCount: z.literal(1), ...vehicle, codes: onePlateCodes.optional() }),
  ])
  .transform(({ codes, ...request }) => ({ service: "deregistration" as const, ...request, ...(codes && { codes: { frontPlate: undefined, ...codes } }) }))

export type StoredDeregistrationRequest = z.output<typeof storedRequestSchema>

export const parseDeregistrationRequest = (input: unknown): DeregistrationRequest =>
  validate(deregistrationRequestSchema, input, "request")

export const parseStoredDeregistrationRequest = (input: unknown): StoredDeregistrationRequest =>
  validate(storedRequestSchema, input, "request")

export function withoutCodes(request: StoredDeregistrationRequest): StoredDeregistrationRequest {
  const kept = { ...request }
  delete kept.codes
  return kept
}
