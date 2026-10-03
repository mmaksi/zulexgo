import type { z } from "zod"
import { emailSchema } from "@/src/core/domain/customer/email"
import { licencePlateSchema } from "@/src/core/domain/vehicle/licence-plate"
import { SecurityCode } from "@/src/core/domain/vehicle/security-code"
import { vinSchema } from "@/src/core/domain/vehicle/vin"

export type PlateCount = 1 | 2

/** What the customer typed, as typed. Parsed into a DeregistrationRequest on the server. */
export interface VehicleData {
  prefix: string
  letters: string
  numbers: string
  vin: string
  rearPlate: string
  frontPlate: string
  certificate: string
  email: string
}

export type VehicleField = keyof VehicleData

export const EMPTY_VEHICLE: VehicleData = {
  prefix: "",
  letters: "",
  numbers: "",
  vin: "",
  rearPlate: "",
  frontPlate: "",
  certificate: "",
  email: "",
}

/** site-contract §2.3: human, action-oriented, never the API's text. */
const RULES: Record<VehicleField, { schema: z.ZodType; message: string }> = {
  prefix: { schema: licencePlateSchema.shape.prefix, message: "Geben Sie das Ortskürzel ein: 1 bis 3 Buchstaben, z. B. B oder HH." },
  letters: { schema: licencePlateSchema.shape.letters, message: "Geben Sie die 1 bis 2 Buchstaben nach dem Ortskürzel ein." },
  numbers: { schema: licencePlateSchema.shape.numbers, message: "Geben Sie die 1 bis 4 Ziffern ein, ohne führende Null." },
  vin: { schema: vinSchema, message: "Prüfen Sie die FIN: bis zu 17 Buchstaben und Ziffern, Feld E im Fahrzeugschein." },
  rearPlate: { schema: SecurityCode.schema("rearPlate"), message: "Prüfen Sie den 3-stelligen Code auf der Plakette des hinteren Kennzeichens." },
  frontPlate: { schema: SecurityCode.schema("frontPlate"), message: "Prüfen Sie den 3-stelligen Code auf der Plakette des vorderen Kennzeichens." },
  certificate: { schema: SecurityCode.schema("certificate"), message: "Prüfen Sie den 7-stelligen Code unter dem Rubbelfeld im Fahrzeugschein." },
  email: { schema: emailSchema, message: "Geben Sie eine gültige E-Mail-Adresse ein, z. B. name@beispiel.de." },
}

/** The fields this vehicle needs, in the order the form shows them: a one-plate vehicle has no front code. */
export const fieldsFor = (plateCount: PlateCount): VehicleField[] =>
  ["prefix", "letters", "numbers", "vin", "rearPlate", ...(plateCount === 2 ? (["frontPlate"] as const) : []), "certificate", "email"]

/** The wording for a field's value, or nothing when it is fine. */
export function validateField(field: VehicleField, value: string): string | undefined {
  return RULES[field].schema.safeParse(value).success ? undefined : RULES[field].message
}

export function validateVehicle(data: VehicleData, plateCount: PlateCount): Partial<Record<VehicleField, string>> {
  const errors: Partial<Record<VehicleField, string>> = {}
  for (const field of fieldsFor(plateCount)) {
    const message = validateField(field, data[field])
    if (message) errors[field] = message
  }
  return errors
}

/** The shape `parseDeregistrationRequest` expects. */
export function toRequest(data: VehicleData, plateCount: PlateCount) {
  const licencePlate = { prefix: data.prefix, letters: data.letters, numbers: data.numbers }
  const codes =
    plateCount === 2
      ? { rearPlate: data.rearPlate, frontPlate: data.frontPlate, certificate: data.certificate }
      : { rearPlate: data.rearPlate, certificate: data.certificate }
  return { plateCount, licencePlate, vin: data.vin, codes }
}
