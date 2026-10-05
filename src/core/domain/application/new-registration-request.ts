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

/** What every Neuzulassung carries, whether it is being ordered or already stored. The bank account is added by each schema. */
const requestFields = (now: Date) => ({
  // A new car's VIN has 17 characters, and Zulex's PATCH cannot change it: a dropped character would end the order.
  vin: vinSchema.refine((vin) => vin.length === 17),
  engineType: engineTypeSchema,
  evbNumber: evbNumberSchema,
  registrationCertificate: registrationCertificatePart2Schema,
  owner: ownerSchema(now),
  plate: plateOptionsSchema.default({ electric: false }),
})

const bankAccountField = secret(bankAccountSchema, "bank account")

/** Launch plan Q49, provisional: an E-plate only for a fully electric car. */
const electricPlateNeedsElectricCar = ({ engineType, plate }: { engineType: EngineType; plate: PlateOptions }) => !plate.electric || engineType === "electric"
const ELECTRIC_PLATE_PATH = { path: ["plate", "electric"] }

const named = <Request extends object>(request: Request) => ({ service: "newRegistration" as const, ...request })

/**
 * What the customer enters and Zulex receives to register a brand-new car (launch plan Q49,
 * provisional: cars, private persons of age, standard registration, shipping to the owner's
 * address). What is fixed at launch and the same for every order (the vehicle type, the usage,
 * the delivery) is not in it: the Zulex adapter adds it.
 *
 * Made per request because the keeper's age is checked against `now`: the funnel passes the
 * browser's clock, the server its own. It names its service, which the browser never sends: the
 * request is what tells an order's service. The eVB number, the Teil II code, the owner's personal
 * details and the bank account are secrets (they print as placeholders).
 */
export const newRegistrationRequestSchema = (now: Date) =>
  z
    .object({ ...requestFields(now), bankAccount: bankAccountField })
    .refine(electricPlateNeedsElectricCar, ELECTRIC_PLATE_PATH)
    .transform(named)

export type NewRegistrationRequest = z.output<ReturnType<typeof newRegistrationRequestSchema>>

/**
 * A Neuzulassung as an order stores it: `NewRegistrationRequest`, but without the bank account once the
 * order has ended (`withoutBankAccount`). The account is for the vehicle tax, which is set up when the
 * order is filed, so nothing keeps it after that (launch plan Q54, provisional).
 */
const storedRequestSchema = (now: Date) =>
  z
    .object({ ...requestFields(now), bankAccount: bankAccountField.optional() })
    .refine(electricPlateNeedsElectricCar, ELECTRIC_PLATE_PATH)
    .transform(named)

export type StoredNewRegistrationRequest = z.output<ReturnType<typeof storedRequestSchema>>

/**
 * Throws a `ValidationError` naming every invalid field at once, dotted for nested ones
 * (`owner.address.postcode`, `bankAccount.iban`), never their values.
 */
export const parseNewRegistrationRequest = (input: unknown, now: Date): NewRegistrationRequest =>
  validate(newRegistrationRequestSchema(now), input, "request")

/** Reads what an order stored: as `parseNewRegistrationRequest`, but an order may no longer hold its bank account. */
export const parseStoredNewRegistrationRequest = (input: unknown, now: Date): StoredNewRegistrationRequest =>
  validate(storedRequestSchema(now), input, "request")

/** The request of an order that has ended: nothing but the bank account is taken from it. */
export function withoutBankAccount(request: StoredNewRegistrationRequest): StoredNewRegistrationRequest {
  const kept = { ...request }
  delete kept.bankAccount
  return kept
}
