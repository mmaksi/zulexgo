import type { z } from "zod"
import { ValidationError } from "@/src/core/errors/validation-error"

export function validate<Schema extends z.ZodType>(schema: Schema, input: unknown, field: string): z.output<Schema> {
  const result = schema.safeParse(input)
  if (result.success) return result.data

  const fields = result.error.issues.map((issue) => issue.path.join(".") || field)
  throw new ValidationError([...new Set(fields)])
}
