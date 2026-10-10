import { z } from "zod"
import { ValidationError } from "@/src/core/errors/validation-error"
import { ownerSchema } from "@/src/core/domain/customer/owner"
import type { Secret } from "@/src/core/domain/secret"
import { validate } from "@/src/core/domain/validate"
import { evbNumberSchema } from "@/src/core/domain/vehicle/evb-number"
import { registrationCertificatePart2Schema } from "@/src/core/domain/vehicle/registration-certificate-part2"
import type { StoredNewRegistrationRequest } from "./new-registration-request"

export interface NewRegistrationCorrectionInput {
  evbNumber?: string
  part2Number?: string
  part2SecurityCode?: string
  firstName?: string
  lastName?: string
  birthDate?: string
}

export interface NewRegistrationCorrection {
  readonly evbNumber?: Secret<string>
  readonly part2Number?: string
  readonly part2SecurityCode?: Secret<string>
  readonly firstName?: string
  readonly lastName?: string
  readonly birthDate?: Secret<string>
}

const optional = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional())

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

// Provisional: launch plan Q53, Q47. Once filed, Zulex's PATCH takes only the eVB and Teil II fields.
export function parseNewRegistrationCorrection(
  input: NewRegistrationCorrectionInput,
  { identityVerified }: { identityVerified: boolean },
  now: Date,
): NewRegistrationCorrection {
  const correction = validate(correctionForm(now, identityVerified), input, "correction")
  if (Object.values(correction).every((value) => value === undefined)) throw new ValidationError(["correction"])
  return correction
}

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
