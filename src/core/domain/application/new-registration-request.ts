import { z } from "zod"
import { bankAccountSchema } from "@/src/core/domain/customer/bank-account"
import { ownerSchema } from "@/src/core/domain/customer/owner"
import { secret } from "@/src/core/domain/secret"
import { validate } from "@/src/core/domain/validate"
import { engineTypeSchema } from "@/src/core/domain/vehicle/engine-type"
import { evbNumberSchema } from "@/src/core/domain/vehicle/evb-number"
import { plateOptionsSchema } from "@/src/core/domain/vehicle/plate-options"
import { registrationCertificatePart2Schema } from "@/src/core/domain/vehicle/registration-certificate-part2"
import { vinSchema } from "@/src/core/domain/vehicle/vin"

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
    .object({
      // A new car's VIN has 17 characters, and Zulex's PATCH cannot change it: a dropped character would end the order.
      vin: vinSchema.refine((vin) => vin.length === 17),
      engineType: engineTypeSchema,
      evbNumber: evbNumberSchema,
      registrationCertificate: registrationCertificatePart2Schema,
      owner: ownerSchema(now),
      bankAccount: secret(bankAccountSchema, "bank account"),
      plate: plateOptionsSchema.default({ electric: false }),
    })
    // Launch plan Q49, provisional: an E-plate only for a fully electric car.
    .refine(({ engineType, plate }) => !plate.electric || engineType === "electric", { path: ["plate", "electric"] })
    .transform((request) => ({ service: "newRegistration" as const, ...request }))

export type NewRegistrationRequest = z.output<ReturnType<typeof newRegistrationRequestSchema>>

/**
 * Throws a `ValidationError` naming every invalid field at once, dotted for nested ones
 * (`owner.address.postcode`, `bankAccount.iban`), never their values.
 */
export const parseNewRegistrationRequest = (input: unknown, now: Date): NewRegistrationRequest =>
  validate(newRegistrationRequestSchema(now), input, "request")
