import { z } from "zod"

// The house-number pattern is the Zulex API's own, used as it is.
export const postalAddressSchema = z.object({
  street: z.string().trim().min(1),
  houseNumber: z.string().trim().regex(/^(\d{1,4})(?!\d)(.*)$/),
  postcode: z.string().trim().regex(/^\d{5}$/),
  city: z.string().trim().min(1),
})

export type PostalAddress = z.output<typeof postalAddressSchema>
