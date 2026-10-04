import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

/** Moves the first four characters to the end and reads the letters as numbers (A is 10): the result must leave 1 modulo 97. */
function checksumHolds(iban: string): boolean {
  let remainder = 0
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const value = Number.parseInt(char, 36)
    if (Number.isNaN(value)) return false
    remainder = Number(`${remainder}${value}`) % 97
  }
  return remainder === 1
}

/**
 * Launch plan Q54, a provisional answer pending the founder: German accounts only, held by the
 * owner (the API has no field for another holder). Spaces are dropped and letters upper-cased,
 * then the shape and the checksum are checked: a typo in an account cannot be corrected once the
 * order is filed, so it must be caught here.
 */
const ibanSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^DE\d{20}$/))
  .refine(checksumHolds)

/** Eight or eleven characters: bank, country, location and an optional branch (ISO 9362). Checked as typed, then upper-cased (`ß` would become `SS`). */
const bicSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/)
  .toUpperCase()

/**
 * The account the vehicle tax is collected from by direct debit. The API's `country` is the IBAN's,
 * so the customer is not asked for it.
 */
export const bankAccountSchema = z
  .object({
    iban: ibanSchema,
    bic: bicSchema,
    bankName: z.string().trim().min(1),
  })
  .transform((account) => ({ ...account, country: account.iban.slice(0, 2) }))

export type BankAccount = z.output<typeof bankAccountSchema>

/** Throws a `ValidationError` naming the wrong parts (`iban`, `bic`, `bankName`) only, never their values. */
export const parseBankAccount = (input: unknown): BankAccount => validate(bankAccountSchema, input, "bankAccount")
