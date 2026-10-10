import type { Correction } from "@/src/core/ports/registration/registration-gateway"
import { ValidationError } from "@/src/core/errors/validation-error"
import { parseDeregistrationRequest, type DeregistrationRequest, type StoredDeregistrationRequest } from "./deregistration-request"
import type { NewRegistrationCorrectionInput } from "./new-registration-correction"
import { SecurityCode, type SecurityCodeKind } from "@/src/core/domain/vehicle/security-code"
import { vinSchema } from "@/src/core/domain/vehicle/vin"

export interface CorrectionInput {
  vin?: string
  rearPlate?: string
  frontPlate?: string
  certificate?: string
}

export type OrderCorrectionInput = CorrectionInput & NewRegistrationCorrectionInput

const CODES: SecurityCodeKind[] = ["rearPlate", "frontPlate", "certificate"]

// Provisional: launch plan Q26 (plate not correctable). Errors name wrong fields, never their values.
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
