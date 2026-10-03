import { z } from "zod"
import { secret } from "@/src/core/domain/secret"
import { validate } from "@/src/core/domain/validate"

/**
 * The Zulassungsbescheinigung Teil II (the vehicle title) a new car comes with. Launch plan Q56,
 * a provisional answer pending Zulex: the API gives the number 1 to 20 characters and the
 * security code at least one, and says no more, so nothing stricter is checked. The number is
 * trimmed; the code is trimmed and kept as typed.
 */
export const registrationCertificatePart2Schema = z.object({
  number: z.string().trim().min(1).max(20),
  /** The concealed code under the scratch field: proof of possession, so a secret. */
  securityCode: secret(z.string().trim().min(1), "Teil II security code"),
})

export type RegistrationCertificatePart2 = z.output<typeof registrationCertificatePart2Schema>

/** Throws a `ValidationError` naming the wrong parts (`number`, `securityCode`) only. */
export const parseRegistrationCertificatePart2 = (input: unknown): RegistrationCertificatePart2 =>
  validate(registrationCertificatePart2Schema, input, "registrationCertificate")
