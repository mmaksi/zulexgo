import { z } from "zod"
import { bankAccountSchema } from "@/src/core/domain/customer/bank-account"
import { ownerSchema } from "@/src/core/domain/customer/owner"
import { secret } from "@/src/core/domain/secret"
import { validate } from "@/src/core/domain/validate"
import { engineTypeSchema, type EngineType } from "@/src/core/domain/vehicle/engine-type"
import { evbNumberSchema } from "@/src/core/domain/vehicle/evb-number"
import { plateOptionsSchema, type PlateOptions } from "@/src/core/domain/vehicle/plate-options"
import { registrationCertificatePart2Schema } from "@/src/core/domain/vehicle/registration-certificate-part2"
import { vinSchema } from "@/src/core/domain/vehicle/vin"

const requestFields = (now: Date) => ({
  // Zulex's PATCH cannot change the VIN, so a dropped character would end the order.
  vin: vinSchema.refine((vin) => vin.length === 17),
  engineType: engineTypeSchema,
  evbNumber: evbNumberSchema,
  registrationCertificate: registrationCertificatePart2Schema,
  owner: ownerSchema(now),
  plate: plateOptionsSchema.default({ electric: false }),
})

const bankAccountField = secret(bankAccountSchema, "bank account")

// Provisional: launch plan Q49
const electricPlateNeedsElectricCar = ({ engineType, plate }: { engineType: EngineType; plate: PlateOptions }) => !plate.electric || engineType === "electric"
const ELECTRIC_PLATE_PATH = { path: ["plate", "electric"] }

const named = <Request extends object>(request: Request) => ({ service: "newRegistration" as const, ...request })

// Provisional scope: launch plan Q49 (cars, private persons of age, standard registration)
export const newRegistrationRequestSchema = (now: Date) =>
  z
    .object({ ...requestFields(now), bankAccount: bankAccountField })
    .refine(electricPlateNeedsElectricCar, ELECTRIC_PLATE_PATH)
    .transform(named)

export type NewRegistrationRequest = z.output<ReturnType<typeof newRegistrationRequestSchema>>

// Provisional: launch plan Q54: the bank account is only for the vehicle tax, so an ended order drops it.
const storedRequestSchema = (now: Date) =>
  z
    .object({ ...requestFields(now), bankAccount: bankAccountField.optional() })
    .refine(electricPlateNeedsElectricCar, ELECTRIC_PLATE_PATH)
    .transform(named)

export type StoredNewRegistrationRequest = z.output<ReturnType<typeof storedRequestSchema>>

export const parseNewRegistrationRequest = (input: unknown, now: Date): NewRegistrationRequest =>
  validate(newRegistrationRequestSchema(now), input, "request")

export const parseStoredNewRegistrationRequest = (input: unknown, now: Date): StoredNewRegistrationRequest =>
  validate(storedRequestSchema(now), input, "request")

export function withoutBankAccount(request: StoredNewRegistrationRequest): StoredNewRegistrationRequest {
  const kept = { ...request }
  delete kept.bankAccount
  return kept
}
