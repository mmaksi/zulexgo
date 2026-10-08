import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

/**
 * As loose as the Zulex API: up to 17 characters, so vehicles older than the 17-character
 * standard pass. Trimmed and upper-cased; any letters and digits, with no check-digit test,
 * so it never turns away a VIN the API would accept. The characters are checked as typed,
 * before upper-casing, which would turn `ß` into `SS` and `ſ` into `S`: a letter the customer
 * never typed would reach the KBA.
 */
export const vinSchema = z.string().trim().regex(/^[A-Za-z0-9]{1,17}$/).toUpperCase().brand<"Vin">()

export type Vin = z.output<typeof vinSchema>

/** Throws a `ValidationError` for `vin`, never carrying the input. */
export const parseVin = (input: unknown): Vin => validate(vinSchema, input, "vin")
