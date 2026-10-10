import { z } from "zod"

function checksumHolds(iban: string): boolean {
  let remainder = 0
  for (const char of iban.slice(4) + iban.slice(0, 4)) {
    const value = Number.parseInt(char, 36)
    if (Number.isNaN(value)) return false
    remainder = Number(`${remainder}${value}`) % 97
  }
  return remainder === 1
}

// Provisional: launch plan Q54 (German accounts only). A typo cannot be corrected once filed.
const ibanSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, "").toUpperCase())
  .pipe(z.string().regex(/^DE\d{20}$/))
  .refine(checksumHolds)

// Checked as typed, before upper-casing: ß would become SS, letters the customer never typed.
const bicSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/)
  .toUpperCase()

export const bankAccountSchema = z
  .object({
    iban: ibanSchema,
    bic: bicSchema,
    bankName: z.string().trim().min(1),
  })
  .transform((account) => ({ ...account, country: account.iban.slice(0, 2) }))

export type BankAccount = z.output<typeof bankAccountSchema>
