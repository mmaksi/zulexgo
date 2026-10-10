import { z } from "zod"
import { secret } from "@/src/core/domain/secret"

// Provisional: launch plan Q56: only the API's own limits are checked, as it says no more.
export const registrationCertificatePart2Schema = z.object({
  number: z.string().trim().min(1).max(20),
  securityCode: secret(z.string().trim().min(1), "Teil II security code"),
})

export type RegistrationCertificatePart2 = z.output<typeof registrationCertificatePart2Schema>
