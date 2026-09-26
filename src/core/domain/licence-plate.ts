import { z } from "zod"
import { validate } from "./validate"

const normalised = () => z.string().trim().toUpperCase()

/** The Zulex `LicencePlate` patterns; shared with the funnel so the client rejects what the API would. */
export const licencePlateSchema = z.object({
  prefix: normalised().regex(/^[A-ZÄÖÜ]{1,3}$/),
  letters: normalised().regex(/^[A-Z]{1,2}$/),
  numbers: z.string().trim().regex(/^[1-9]\d{0,3}$/),
})

export type LicencePlate = z.output<typeof licencePlateSchema>

export const parseLicencePlate = (input: unknown): LicencePlate => validate(licencePlateSchema, input, "licencePlate")
