import { createHash } from "node:crypto"
import { applicationReferenceSchema, parseApplicationReference } from "@/src/core/domain/application/application-reference"
import { emailSchema } from "@/src/core/domain/customer/email"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import type { RateLimitDecision } from "@/src/core/ports/rate-limit/rate-limiter"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

// Counted whether or not the order exists, so the limit reveals nothing about it.
export async function limitResend(
  deps: Pick<Dependencies, "rateLimiter">,
  { address, reference }: { address: string; reference: string },
): Promise<RateLimitDecision> {
  const order = parseApplicationReference(reference)
  // Address first, so a caller over its bound does not also spend the order's allowance.
  const byAddress = await deps.rateLimiter.consume(`resend-link:address:${address}`, RATE_LIMITS.resendLinkPerAddress)
  if (!byAddress.allowed) return byAddress
  return deps.rateLimiter.consume(`resend-link:order:${order}`, RATE_LIMITS.resendLinkPerOrder)
}

// The caller answers before running this, so the time taken says nothing about a match.
export async function resendStatusLink(
  deps: Pick<Dependencies, "repository" | "mailer" | "tokens" | "statusLink">,
  input: { reference: string; email: string },
): Promise<void> {
  const reference = applicationReferenceSchema.safeParse(input.reference)
  const email = emailSchema.safeParse(input.email)
  // Silent on every mismatch: the caller shows one answer whatever happens here.
  if (!reference.success || !email.success) return

  const application = await deps.repository.get(reference.data)
  if (!application || application.status === "awaiting_payment" || application.email !== email.data) return

  const token = deps.tokens.generate()
  // Mail before storing: a failed send leaves the old link working.
  await deps.mailer.send({
    to: application.email,
    template: { name: "statusLinkResent", reference: application.reference, statusLink: deps.statusLink(token) },
    // A hash of the token, not the token: the secret link is not also the mail provider's key.
    idempotencyKey: `${application.reference}/statusLinkResent/${createHash("sha256").update(token).digest("hex").slice(0, 16)}`,
  })
  await deps.repository.setStatusToken(application.reference, token)
}
