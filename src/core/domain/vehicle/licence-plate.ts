import { z } from "zod"

const normalised = () => z.string().trim().toUpperCase()

// Zulex's `LicencePlate` patterns, so the funnel rejects what the API would.
export const licencePlateSchema = z.object({
  prefix: normalised().regex(/^[A-ZÄÖÜ]{1,3}$/),
  letters: normalised().regex(/^[A-Z]{1,2}$/),
  numbers: z.string().trim().regex(/^[1-9]\d{0,3}$/),
})

export type LicencePlate = z.output<typeof licencePlateSchema>
