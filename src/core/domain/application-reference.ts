import { z } from "zod"
import { validate } from "./validate"

/** Crockford base32: no I, L, O or U, so a reference read aloud or retyped survives. */
export const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
export const REFERENCE_LENGTH = 6

const PATTERN = new RegExp(`^ZG-[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`)

/** The order ID a customer quotes to support. It identifies an application; it never grants access to one. */
export const applicationReferenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((raw) => raw.replace(/^ZG-/, "").replace(/[IL]/g, "1").replace(/O/g, "0"))
  .transform((body) => `ZG-${body}`)
  .pipe(z.string().regex(PATTERN))
  .brand<"ApplicationReference">()

export type ApplicationReference = z.output<typeof applicationReferenceSchema>

export const parseApplicationReference = (input: unknown): ApplicationReference =>
  validate(applicationReferenceSchema, input, "reference")

/**
 * Folds a random token into a reference, so reference generation needs no port
 * of its own. Every character counts; a collision is caught by the repository.
 */
export function referenceFromToken(token: string): ApplicationReference {
  const slots = Array<number>(REFERENCE_LENGTH).fill(0)
  for (let index = 0; index < token.length; index++) {
    const slot = index % REFERENCE_LENGTH
    slots[slot] = (slots[slot] * 31 + token.charCodeAt(index)) % REFERENCE_ALPHABET.length
  }
  return parseApplicationReference(`ZG-${slots.map((value) => REFERENCE_ALPHABET[value]).join("")}`)
}
