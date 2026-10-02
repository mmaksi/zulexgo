import type { z } from "zod"
import { ValidationError } from "@/src/core/errors/validation-error"

/**
 * Parses with a schema and turns a failure into a ValidationError that carries field names only.
 * Every invalid field is reported at once, once each, dotted when nested (`codes.certificate`).
 * `field` names a failure with no path of its own, such as a value of the wrong type at the top.
 */
export function validate<Schema extends z.ZodType>(schema: Schema, input: unknown, field: string): z.output<Schema> {
  const result = schema.safeParse(input)
  if (result.success) return result.data

  const fields = result.error.issues.map((issue) => issue.path.join(".") || field)
  throw new ValidationError([...new Set(fields)])
}
