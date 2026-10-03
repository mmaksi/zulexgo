import { z } from "zod"
import { validate } from "@/src/core/domain/validate"

/** A calendar month, 1 (January) to 12 (December), as the API takes it. */
const month = z.number().int().min(1).max(12)

/**
 * What the customer may ask of the plate the authority assigns (launch plan Q49 and Q51,
 * provisional: no wish plate, no H-plate). An E-plate, and a seasonal plate with its first and
 * last month, each month 1 to 12. Whether an E-plate fits the car is the request's check, since it
 * depends on the engine.
 */
export const plateOptionsSchema = z.object({
  electric: z.boolean().default(false),
  seasonal: z.object({ from: month, until: month }).optional(),
})

export type PlateOptions = z.output<typeof plateOptionsSchema>

/** Throws a `ValidationError` naming the wrong parts, dotted (`seasonal.from`), never their values. */
export const parsePlateOptions = (input: unknown): PlateOptions => validate(plateOptionsSchema, input, "plate")
