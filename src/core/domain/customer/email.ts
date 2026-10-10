import { z } from "zod"

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).brand<"Email">()

export type Email = z.output<typeof emailSchema>
