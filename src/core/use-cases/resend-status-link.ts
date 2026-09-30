import { createHash } from "node:crypto"
import { applicationReferenceSchema, parseApplicationReference } from "@/src/core/domain/application-reference"
import { emailSchema } from "@/src/core/domain/email"
import { RATE_LIMITS } from "@/src/core/domain/rate-limits"
import type { RateLimitDecision } from "@/src/core/ports/rate-limiter"
import type { Dependencies } from "./dependencies"

/**
 * Counts a "send me my link again" request against the address that made it
 * and against the order it names, whoever asks, so neither a single caller nor
 * a crowd can flood one customer's inbox. Counted whether or not the order
 * exists, so the limit tells nothing about it. The caller has validated the
 * reference.
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
 */
export async function resendStatusLink(
  deps: Pick<Dependencies, "repository" | "mailer" | "tokens" | "statusLink">,
  input: { reference: string; email: string },
): Promise<void> {
  const reference = applicationReferenceSchema.safeParse(input.reference)
  const email = emailSchema.safeParse(input.email)
  if (!reference.success || !email.success) return

  const application = await deps.repository.get(reference.data)
  if (!application || application.status === "awaiting_payment" || application.email !== email.data) return

  const token = deps.tokens.generate()
  await deps.mailer.send({
    to: application.email,
    template: { name: "statusLinkResent", reference: application.reference, statusLink: deps.statusLink(token) },
    idempotencyKey: `${application.reference}/statusLinkResent/${createHash("sha256").update(token).digest("hex").slice(0, 16)}`,
  })
  await deps.repository.setStatusToken(application.reference, token)
}
