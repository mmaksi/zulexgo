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
