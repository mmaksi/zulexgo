import type { Correction } from "@/src/core/ports/registration-gateway"
import { ValidationError } from "@/src/core/errors/validation-error"
import { parseDeregistrationRequest, type DeregistrationRequest } from "./deregistration-request"
import { SecurityCode, type SecurityCodeKind } from "./security-code"
import { vinSchema } from "./vin"

/** What the correction form sends: the fields the customer changed, as typed; blank means unchanged. */
export interface CorrectionInput {
  vin?: string
  rearPlate?: string
  frontPlate?: string
  certificate?: string
}

const CODES: SecurityCodeKind[] = ["rearPlate", "frontPlate", "certificate"]

/**
 * Launch plan Q26, a provisional answer pending the founder: the VIN and the
 * three security codes can be corrected, the plate cannot (a different plate is
 * a different vehicle, so a new order). Fields left blank stay as they were.
 * Throws a `ValidationError` naming the wrong fields, never their values.
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
    const parsed = kind === "frontPlate" && plateCount === 1 ? undefined : SecurityCode.schema(kind).safeParse(value)
    if (parsed?.success) codes[kind] = parsed.data
    else wrong.push(kind)
  }

  if (wrong.length > 0) throw new ValidationError(wrong)
  if (vin === undefined && Object.keys(codes).length === 0) throw new ValidationError(["correction"])

  return { ...(parsedVin?.success ? { vin: parsedVin.data } : {}), ...(Object.keys(codes).length > 0 ? { codes } : {}) }
}

/** The request with the corrected fields replaced, re-validated as any request is. */
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
