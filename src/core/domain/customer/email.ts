import { z } from "zod"

/**
 * Where the status link and every status email go. The order's address is not sent to Zulex (the
 * owner's own address on a Neuzulassung, parsed with this schema too, is). Trimmed and lower-cased,
 * so an address typed in another case still equals the one on file when "Resend my link"
 * compares them.
 */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).brand<"Email">()

export type Email = z.output<typeof emailSchema>
