import { z } from "zod"
import { ValidationError } from "@/src/core/errors/validation-error"
import { ownerSchema } from "@/src/core/domain/customer/owner"
import type { Secret } from "@/src/core/domain/secret"
import { validate } from "@/src/core/domain/validate"
import { evbNumberSchema } from "@/src/core/domain/vehicle/evb-number"
import { registrationCertificatePart2Schema } from "@/src/core/domain/vehicle/registration-certificate-part2"
import type { StoredNewRegistrationRequest } from "./new-registration-request"

/** What the Neuzulassung correction form sends: the fields the customer changed, as typed; blank means unchanged. */
export interface NewRegistrationCorrectionInput {
  evbNumber?: string
  part2Number?: string
  part2SecurityCode?: string
  firstName?: string
  lastName?: string
  birthDate?: string
}

/** Only the fields the customer changed; the secrets stay secrets. */
export interface NewRegistrationCorrection {
  readonly evbNumber?: Secret<string>
  readonly part2Number?: string
  readonly part2SecurityCode?: Secret<string>
  readonly firstName?: string
  readonly lastName?: string
  readonly birthDate?: Secret<string>
}

/** A field left blank is unchanged, as the de-registration form has it. */
const optional = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional())

/**
 * Until the owner's identity has been verified their name and birth date can be corrected; after it
 * they cannot, so a value typed for one is refused as that field (`z.never`) rather than silently dropped.
 */
const correctionForm = (now: Date, identityVerified: boolean) => {
  const owner = ownerSchema(now).shape
  const beforeVerificationOnly = <Schema extends z.ZodType>(schema: Schema) => (identityVerified ? z.never() : schema)
  return z.object({
    evbNumber: optional(evbNumberSchema),
    part2Number: optional(registrationCertificatePart2Schema.shape.number),
    part2SecurityCode: optional(registrationCertificatePart2Schema.shape.securityCode),
    firstName: optional(beforeVerificationOnly(owner.firstName)),
    lastName: optional(beforeVerificationOnly(owner.lastName)),
    birthDate: optional(beforeVerificationOnly(owner.birthDate)),
  })
}

/**
 * Launch plan Q53 and Q47, provisional answers pending the founder: the eVB number and the Teil II
 * number and code can be corrected, which are the fields Zulex's `PATCH` takes once an application
 * is filed. The owner's name and birth date can too, but only while the order's identity was never
 * verified (`identityVerified` is false), after a verification found the person is not the one the
 * order names. Once it was verified the person was checked against that name, and once filed the API
 * cannot change it, so a typo there ends the order. Fields left blank stay as they were.
 * Throws a `ValidationError` naming the wrong fields, never their values. A form with nothing
 * filled in is refused as `correction`. The birth date is checked against `now` as at checkout.
 */
export function parseNewRegistrationCorrection(
  input: NewRegistrationCorrectionInput,
  { identityVerified }: { identityVerified: boolean },
  now: Date,
): NewRegistrationCorrection {
  const correction = validate(correctionForm(now, identityVerified), input, "correction")
  if (Object.values(correction).every((value) => value === undefined)) throw new ValidationError(["correction"])
  return correction
}

/**
 * The request with the corrected fields replaced; the given request is not changed. Each
 * corrected field has been validated on its own, and none depends on another, so the result is a
 * valid request.
 */
export function applyNewRegistrationCorrection(request: StoredNewRegistrationRequest, correction: NewRegistrationCorrection): StoredNewRegistrationRequest {
  return {
    ...request,
    evbNumber: correction.evbNumber ?? request.evbNumber,
    registrationCertificate: {
      number: correction.part2Number ?? request.registrationCertificate.number,
      securityCode: correction.part2SecurityCode ?? request.registrationCertificate.securityCode,
    },
    owner: {
      ...request.owner,
      firstName: correction.firstName ?? request.owner.firstName,
      lastName: correction.lastName ?? request.owner.lastName,
      birthDate: correction.birthDate ?? request.owner.birthDate,
    },
  }
}
