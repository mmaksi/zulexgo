import { z } from "zod"

// As loose as the Zulex API, so older, shorter VINs pass. Checked before upper-casing: ß becomes SS.
export const vinSchema = z.string().trim().regex(/^[A-Za-z0-9]{1,17}$/).toUpperCase().brand<"Vin">()

export type Vin = z.output<typeof vinSchema>
