import { z } from "zod"
import type { Correction } from "@/src/core/ports/registration/registration-gateway"
import { ValidationError } from "@/src/core/errors/validation-error"
import { ownerSchema } from "@/src/core/domain/customer/owner"
import type { Secret } from "@/src/core/domain/secret"
import { validate } from "@/src/core/domain/validate"
import { evbNumberSchema } from "@/src/core/domain/vehicle/evb-number"
import { registrationCertificatePart2Schema } from "@/src/core/domain/vehicle/registration-certificate-part2"
import { parseDeregistrationRequest, type DeregistrationRequest } from "./deregistration-request"
import type { NewRegistrationRequest } from "./new-registration-request"
import { SecurityCode, type SecurityCodeKind } from "@/src/core/domain/vehicle/security-code"
import { vinSchema } from "@/src/core/domain/vehicle/vin"

/** What the correction form sends: the fields the customer changed, as typed; blank means unchanged. */
export interface CorrectionInput {
  vin?: string
  rearPlate?: string
  frontPlate?: string
  certificate?: string
}

/** The security codes that can be corrected, in the order wrong ones are reported. */
const CODES: SecurityCodeKind[] = ["rearPlate", "frontPlate", "certificate"]

/**
 * Launch plan Q26, a provisional answer pending the founder: the VIN and the
 * three security codes can be corrected, the plate cannot (a different plate is
 * a different vehicle, so a new order). Fields left blank stay as they were.
 * Throws a `ValidationError` naming the wrong fields, never their values.
 *
 * `plateCount` is the order's own: a front code for a one-plate vehicle is refused as
 * `frontPlate`, since there is no front seal to correct. A form with nothing filled in is
 * refused as `correction`. The result is the registration gateway's `Correction`: only the
 * changed fields, the codes as `SecurityCode`s.
 */
export function parseCorrection(input: CorrectionInput, plateCount: 1 | 2): Correction {
  const given = (value: string | undefined) => (value?.trim() ? value : undefined)
  const wrong: string[] = []

  const vin = given(input.vin)
  const parsedVin = vin === undefined ? undefined : vinSchema.safeParse(vin)
  if (parsedVin && !parsedVin.success) wrong.push("vin")

  const codes: Partial<Record<SecurityCodeKind, SecurityCode>> = {}
  for (const kind of CODES) {
    const value = given(input[kind])
    if (value === undefined) continue
    // undefined fails the check below, so a front code on a one-plate order is reported as wrong.
    const parsed = kind === "frontPlate" && plateCount === 1 ? undefined : SecurityCode.schema(kind).safeParse(value)
    if (parsed?.success) codes[kind] = parsed.data
    else wrong.push(kind)
  }

  if (wrong.length > 0) throw new ValidationError(wrong)
  if (vin === undefined && Object.keys(codes).length === 0) throw new ValidationError(["correction"])

  return { ...(parsedVin?.success ? { vin: parsedVin.data } : {}), ...(Object.keys(codes).length > 0 ? { codes } : {}) }
}

/**
 * The request with the corrected fields replaced, re-validated as any request is, so it
 * throws a `ValidationError` if the result is not a valid request. The codes are revealed
 * only to be parsed again into new `SecurityCode`s; the given request is not changed.
 */
export function applyCorrection(request: DeregistrationRequest, { vin, codes }: Correction): DeregistrationRequest {
  const current = request.codes
  return parseDeregistrationRequest({
    plateCount: request.plateCount,
    licencePlate: request.licencePlate,
    vin: vin ?? request.vin,
    codes: {
      rearPlate: (codes?.rearPlate ?? current.rearPlate).reveal(),
      ...(request.plateCount === 2 ? { frontPlate: (codes?.frontPlate ?? current.frontPlate)!.reveal() } : {}),
      certificate: (codes?.certificate ?? current.certificate).reveal(),
    },
  })
}

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
 * Before filing the owner's name and birth date can be corrected; after filing they cannot, so
 * a value typed for one is refused as that field (`z.never`) rather than silently dropped.
 */
const correctionForm = (now: Date, filed: boolean) => {
  const owner = ownerSchema(now).shape
  const beforeFilingOnly = <Schema extends z.ZodType>(schema: Schema) => (filed ? z.never() : schema)
  return z.object({
    evbNumber: optional(evbNumberSchema),
    part2Number: optional(registrationCertificatePart2Schema.shape.number),
    part2SecurityCode: optional(registrationCertificatePart2Schema.shape.securityCode),
    firstName: optional(beforeFilingOnly(owner.firstName)),
    lastName: optional(beforeFilingOnly(owner.lastName)),
    birthDate: optional(beforeFilingOnly(owner.birthDate)),
  })
}

/**
 * Launch plan Q53 and Q47, provisional answers pending the founder: the eVB number and the Teil II
 * number and code can be corrected, which are the fields Zulex's `PATCH` takes once an application
 * is filed. The owner's name and birth date can too, but only while nothing is filed (`filed` is
 * false), after a verification found the person is not the one the order names; once filed the API
 * cannot change them, so a typo there ends the order. Fields left blank stay as they were.
 * Throws a `ValidationError` naming the wrong fields, never their values. A form with nothing
 * filled in is refused as `correction`. The birth date is checked against `now` as at checkout.
 */
export function parseNewRegistrationCorrection(input: NewRegistrationCorrectionInput, { filed }: { filed: boolean }, now: Date): NewRegistrationCorrection {
  const correction = validate(correctionForm(now, filed), input, "correction")
  if (Object.values(correction).every((value) => value === undefined)) throw new ValidationError(["correction"])
  return correction
}

/**
 * The request with the corrected fields replaced; the given request is not changed. Each
 * corrected field has been validated on its own, and none depends on another, so the result is a
 * valid request.
 */
export function applyNewRegistrationCorrection(request: NewRegistrationRequest, correction: NewRegistrationCorrection): NewRegistrationRequest {
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
