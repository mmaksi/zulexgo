import { z } from "zod"
import { validate } from "./validate"

/** As loose as the Zulex API: up to 17 characters, so vehicles older than the 17-character standard pass. */
export const vinSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,17}$/).brand<"Vin">()

export type Vin = z.output<typeof vinSchema>

export const parseVin = (input: unknown): Vin => validate(vinSchema, input, "vin")
