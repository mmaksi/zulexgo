import { z } from "zod"

/** Where the status link and every status email go. Not sent to Zulex. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).brand<"Email">()

export type Email = z.output<typeof emailSchema>
