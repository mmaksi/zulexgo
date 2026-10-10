import { z } from "zod"
import { secret } from "@/src/core/domain/secret"

// Checked as typed, before upper-casing: ß would become SS, letters the customer never typed.
export const evbNumberSchema = secret(
  z
    .string()
    .trim()
    .regex(/^[A-HJ-NP-Za-hj-np-z0-9]{7}$/)
    .toUpperCase(),
  "eVB number",
)
