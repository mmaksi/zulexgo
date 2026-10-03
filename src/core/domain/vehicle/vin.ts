import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

/**
 * As loose as the Zulex API: up to 17 characters, so vehicles older than the 17-character
 * standard pass. Trimmed and upper-cased; any letters and digits, with no check-digit test,
 * so it never turns away a VIN the API would accept.
 */
export const vinSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,17}$/).brand<"Vin">()

export type Vin = z.output<typeof vinSchema>

/** Throws a `ValidationError` for `vin`, never carrying the input. */
export const parseVin = (input: unknown): Vin => validate(vinSchema, input, "vin")
