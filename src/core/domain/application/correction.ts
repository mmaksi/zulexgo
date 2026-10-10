import type { Correction } from "@/src/core/ports/registration/registration-gateway"
import { ValidationError } from "@/src/core/errors/validation-error"
import { parseDeregistrationRequest, type DeregistrationRequest, type StoredDeregistrationRequest } from "./deregistration-request"
import type { NewRegistrationCorrectionInput } from "./new-registration-correction"
import { SecurityCode, type SecurityCodeKind } from "@/src/core/domain/vehicle/security-code"
import { vinSchema } from "@/src/core/domain/vehicle/vin"

/** What the correction form sends: the fields the customer changed, as typed; blank means unchanged. */
export interface CorrectionInput {
  vin?: string
  rearPlate?: string
  frontPlate?: string
  certificate?: string
}

/** What a customer sends from the status page: the fields of either service's correction form, of which an order reads its own service's. */
export type OrderCorrectionInput = CorrectionInput & NewRegistrationCorrectionInput

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
 * only to be parsed again into new `SecurityCode`s; the given request is not changed. Only an order at 5b is
 * corrected, and it still holds its codes: they go when an order ends.
 */
export function applyCorrection(request: StoredDeregistrationRequest, { vin, codes }: Correction): DeregistrationRequest {
  const current = request.codes
  if (!current) throw new Error("A de-registration without its security codes cannot be corrected")
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
