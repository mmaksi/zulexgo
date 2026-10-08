import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

/** Trimmed and upper-cased before the pattern runs, so "m" and " m " are the prefix M. */
const normalised = () => z.string().trim().toUpperCase()

/**
 * The Zulex `LicencePlate` patterns; shared with the funnel so the client rejects what the
 * API would. Digits only, so the E, H and seasonal suffixes cannot be entered; the
 * de-registration request has no field for them either.
 */
export const licencePlateSchema = z.object({
  /** The district code: one to three letters, the only part that may hold Ä, Ö or Ü. */
  prefix: normalised().regex(/^[A-ZÄÖÜ]{1,3}$/),
  /** One or two letters, A to Z only. */
  letters: normalised().regex(/^[A-Z]{1,2}$/),
  /** One to four digits, never starting with 0. */
  numbers: z.string().trim().regex(/^[1-9]\d{0,3}$/),
})

export type LicencePlate = z.output<typeof licencePlateSchema>

/** Throws a `ValidationError` naming the wrong parts (`prefix`, `letters`, `numbers`) only. */
export const parseLicencePlate = (input: unknown): LicencePlate => validate(licencePlateSchema, input, "licencePlate")
