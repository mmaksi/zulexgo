import { z } from "zod"
import { secret } from "@/src/core/domain/secret"
import { validate } from "@/src/core/domain/validate"

/**
 * The insurer's electronic insurance confirmation, which proves the car is insured. Seven
 * characters, never the letters I and O. The API's own pattern is not anchored and would accept a
 * valid number inside a longer string, so this one is. Trimmed and upper-cased, the characters
 * checked as typed first: upper-casing would turn `ß` into `SS` and let a letter the customer never
 * typed through. A secret: with it and the Teil II, someone else could register the car.
 */
export const evbNumberSchema = secret(
  z
    .string()
    .trim()
    .regex(/^[A-HJ-NP-Za-hj-np-z0-9]{7}$/)
    .toUpperCase(),
  "eVB number",
)

/** Throws a `ValidationError` for `evbNumber`, never carrying the input. */
export const parseEvbNumber = (input: unknown) => validate(evbNumberSchema, input, "evbNumber")
