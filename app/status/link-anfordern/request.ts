import { applicationReferenceSchema } from "@/src/core/domain/application/application-reference"
import { emailSchema } from "@/src/core/domain/customer/email"
import type { RateLimiter } from "@/src/core/ports/rate-limit/rate-limiter"
import { limitResend, resendStatusLink } from "@/src/core/use-cases/status/resend-status-link"
import { clientAddress } from "@/src/lib/client-address"
import type { ResendFormState } from "./resend-form-state"

const MINUTE = 60_000

/**
 * "Send me my link again". Whatever the order, the answer is the same and comes
 * at once: the work of looking it up and mailing it is handed to `later` (Next's
 * `after`), so neither the words nor the time say whether the pair matched. Only
 * a badly formed reference or address is told apart, since that says nothing
 * about any order; only a caller over the limit is told to wait.
 */
export async function requestStatusLink(
  deps: Parameters<typeof resendStatusLink>[0] & { rateLimiter: RateLimiter },
  headers: Headers,
  input: { reference: string; email: string },
  later: (task: () => Promise<void>) => void,
): Promise<ResendFormState> {
  const reference = applicationReferenceSchema.safeParse(input.reference)
  const email = emailSchema.safeParse(input.email)
  if (!reference.success || !email.success) {
    return {
      status: "invalid",
      errors: {
        ...(reference.success ? {} : { reference: "Bitte geben Sie Ihre Auftragsnummer ein, zum Beispiel ZG-ABC123." }),
        ...(email.success ? {} : { email: "Bitte geben Sie eine gültige E-Mail-Adresse ein." }),
      },
    }
  }

  const attempt = await limitResend(deps, { address: clientAddress(headers), reference: reference.data })
  if (!attempt.allowed) return { status: "limited", retryAfterMinutes: Math.ceil(attempt.retryAfterMs / MINUTE) }

  later(() =>
    resendStatusLink(deps, { reference: reference.data, email: email.data }).catch((error) => {
      // By name only: the message may hold the address the mailer refused.
      console.error(`[resend-link] sending failed: ${error instanceof Error ? error.name : "unknown error"}`)
    }),
  )
  return { status: "accepted" }
}
