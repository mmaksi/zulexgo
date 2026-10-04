import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

/**
 * A German address, the shape the Zulex API takes. Its pattern for the house number is used as it
 * is (one to four digits, then anything but a further digit); the postcode is the five digits of
 * German addresses, which also decide the authority. Everything is trimmed.
 */
export const postalAddressSchema = z.object({
  street: z.string().trim().min(1),
  houseNumber: z.string().trim().regex(/^(\d{1,4})(?!\d)(.*)$/),
  postcode: z.string().trim().regex(/^\d{5}$/),
  city: z.string().trim().min(1),
})

export type PostalAddress = z.output<typeof postalAddressSchema>

/** Throws a `ValidationError` naming the wrong parts (`street`, `houseNumber`, `postcode`, `city`) only. */
export const parsePostalAddress = (input: unknown): PostalAddress => validate(postalAddressSchema, input, "address")
