import { createHash } from "node:crypto"
import { applicationReferenceSchema, parseApplicationReference } from "@/src/core/domain/application/application-reference"
import { emailSchema } from "@/src/core/domain/customer/email"
import { RATE_LIMITS } from "@/src/core/domain/rate-limit/rate-limits"
import type { RateLimitDecision } from "@/src/core/ports/rate-limit/rate-limiter"
import type { Dependencies } from "@/src/core/use-cases/dependencies"

/**
 * Counts a "send me my link again" request against the address that made it
 * and against the order it names, whoever asks, so neither a single caller nor
 * a crowd can flood one customer's inbox. Counted whether or not the order
 * exists, so the limit tells nothing about it. The caller has validated the
 * reference.
 *
 * The address bound is checked first, so a caller over it does not also spend the
 * order's allowance. Returns the refused decision, with the wait, for the form to show.
 */
export async function limitResend(
  deps: Pick<Dependencies, "rateLimiter">,
  { address, reference }: { address: string; reference: string },
): Promise<RateLimitDecision> {
  const order = parseApplicationReference(reference)
  const byAddress = await deps.rateLimiter.consume(`resend-link:address:${address}`, RATE_LIMITS.resendLinkPerAddress)
  if (!byAddress.allowed) return byAddress
  return deps.rateLimiter.consume(`resend-link:order:${order}`, RATE_LIMITS.resendLinkPerOrder)
}

/**
 * Mails a new status link to the address on file for the order, and only when
 * the caller named that address. A wrong pair, an unknown order and an order
 * that has not paid (it has no link) do nothing and look the same from outside,
 * because the caller is shown one answer whatever happens here.
 *
 * The new link is mailed before it is stored, so a failed send leaves the old
 * link working instead of locking the customer out. Each send is keyed by the
 * new link, so two requests in one minute deliver two emails, each with the
 * link that was current when it was sent.
 *
 * Reached from the "Resend my link" form, which counts the request with `limitResend`
 * first and runs this after answering, so the time taken says nothing about a match.
 * Storing the token replaces the old one: earlier links stop working.
 */
export async function resendStatusLink(
  deps: Pick<Dependencies, "repository" | "mailer" | "tokens" | "statusLink">,
  input: { reference: string; email: string },
): Promise<void> {
  const reference = applicationReferenceSchema.safeParse(input.reference)
  const email = emailSchema.safeParse(input.email)
  // Silent on every mismatch: the caller shows one answer whatever happens here.
  if (!reference.success || !email.success) return

  const application = await deps.repository.get(reference.data)
  // An order still awaiting payment has no link yet: it is issued when payment is confirmed.
  if (!application || application.status === "awaiting_payment" || application.email !== email.data) return

  const token = deps.tokens.generate()
  await deps.mailer.send({
    to: application.email,
    template: { name: "statusLinkResent", reference: application.reference, statusLink: deps.statusLink(token) },
    // A hash of the token, not the token: the secret link is not also the mail provider's key.
    idempotencyKey: `${application.reference}/statusLinkResent/${createHash("sha256").update(token).digest("hex").slice(0, 16)}`,
  })
  await deps.repository.setStatusToken(application.reference, token)
}
