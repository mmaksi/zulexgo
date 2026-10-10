import { z } from "zod"

const month = z.number().int().min(1).max(12)

// Provisional: launch plan Q49, Q51 (no wish plate, no H-plate)
export const plateOptionsSchema = z.object({
  electric: z.boolean().default(false),
  seasonal: z.object({ from: month, until: month }).optional(),
})

export type PlateOptions = z.output<typeof plateOptionsSchema>
